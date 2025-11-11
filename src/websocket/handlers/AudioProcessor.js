/**
 * Audio Processor
 * Handles audio chunk processing, VAD, transcription, and AI suggestions
 */

import path from 'path';
import logger from '../../config/logger.js';
import { SOCKET_EVENTS, LOG_PREFIX } from '../../constants/index.js';
import { ProcessingQueue } from '../../utils/ProcessingQueue.js';

export class AudioProcessor {
  constructor(services, state) {
    this.services = services;
    this.state = state;
    
    // Create processing queue to prevent chunk dropping
    // Use configurable limits from config
    const maxConcurrent = services.config.processing?.maxConcurrent || 2;
    const maxQueueSize = services.config.processing?.maxQueueSize || 10;
    this.processingQueue = new ProcessingQueue(maxConcurrent, maxQueueSize);
    
    logger.info('AudioProcessor initialized', {
      maxConcurrent,
      maxQueueSize,
      quickVAD: services.config.processing?.enableQuickVAD !== false
    });
  }

  /**
   * Process a single audio chunk (queued to prevent dropping)
   * @param {string} audioFilePath - Path to audio file
   * @param {number} fileSize - Size of audio file
   * @param {Object} socket - Socket.io socket instance
   */
  async processAudioChunk(audioFilePath, fileSize, socket) {
    // Skip if stopping
    if (this.state.isStopping) {
      logger.debug('Recording stopped, skipping audio chunk processing');
      return;
    }

    // Emit audio chunk info immediately
    this._emitAudioChunkInfo(audioFilePath, fileSize, socket);

    // Add to processing queue to prevent dropping chunks
    const chunkId = path.basename(audioFilePath, '.wav');
    
    try {
      await this.processingQueue.enqueue(
        async () => {
          return await this._processChunkInternal(audioFilePath, fileSize, socket);
        },
        { chunkId, fileSize, path: audioFilePath }
      );
    } catch (error) {
      logger.error('Error queuing audio chunk', { 
        error: error.message,
        file: audioFilePath,
        queueStats: this.processingQueue.getStats()
      });
      
      socket.emit(SOCKET_EVENTS.ERROR, { 
        message: 'Error processing audio chunk', 
        error: error.message 
      });
    }
  }

  /**
   * Internal processing logic (called from queue)
   * @private
   */
  async _processChunkInternal(audioFilePath, fileSize, socket) {
    try {
      // Skip if stopping (check again after queue wait)
      if (this.state.isStopping) {
        logger.debug('Recording stopped during queue wait, skipping chunk');
        return;
      }

      // Step 1: Voice Activity Detection (if enabled)
      if (this.state.vadEnabled !== false) {
        // Use quick check if enabled (faster for obvious cases)
        const useQuickCheck = this.services.config.processing?.enableQuickVAD !== false;
        const vadResult = await this._performVAD(audioFilePath, useQuickCheck);
        if (!vadResult.hasVoice) {
          logger.debug('VAD: No voice detected, skipping transcription', {
            reason: vadResult.reason,
            energy: vadResult.energy?.toFixed(4)
          });
          
          // Delete silent chunk immediately to save space
          if (this.services.config.audio.cleanup.deleteAfterTranscription) {
            this.services.transcription.deleteAudioFile(audioFilePath);
          }
          
          return null; // Skip if no voice detected
        }
      } else {
        logger.debug('VAD disabled, skipping voice detection');
      }

      // Step 2: Transcription
      const transcriptionResult = await this._performTranscription(audioFilePath, socket);
      if (!transcriptionResult || this.state.isStopping) {
        // Delete failed/silent chunks if cleanup enabled
        if (this.services.config.audio.cleanup.deleteAfterTranscription && 
            !this.services.config.audio.cleanup.keepForPlayback) {
          this.services.transcription.deleteAudioFile(audioFilePath);
        }
        return null; // Skip if no transcription or stopping
      }

      // Save and emit transcription
      this._saveAndEmitTranscription(transcriptionResult, socket);

      // Step 3: Generate AI suggestions if enough content
      await this._generateSuggestionsIfReady(transcriptionResult.text, socket);

      // Emit updated stats
      socket.emit(SOCKET_EVENTS.STATS, this._getStats());

      return transcriptionResult;
    } catch (error) {
      logger.error('Error processing audio chunk internally', { 
        error: error.message,
        file: audioFilePath,
        stack: error.stack
      });
      
      socket.emit(SOCKET_EVENTS.ERROR, { 
        message: 'Error processing audio', 
        error: error.message 
      });
      
      throw error; // Re-throw to let queue handle retry if needed
    }
  }

  /**
   * Emit audio chunk information
   * @private
   */
  _emitAudioChunkInfo(audioFilePath, fileSize, socket) {
    const chunkId = path.basename(audioFilePath, '.wav');
    socket.emit('audio-chunk', {
      chunkId,
      filePath: audioFilePath,
      fileSize,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Perform Voice Activity Detection
   * @private
   */
  async _performVAD(audioFilePath, useQuickCheck = true) {
    const vadResult = await this.services.vad.analyzeAudio(audioFilePath, useQuickCheck);
    
    if (!vadResult.hasVoice) {
      logger.debug('VAD: No voice detected, skipping transcription', {
        confidence: vadResult.confidence,
        energy: vadResult.energy,
        reason: vadResult.reason
      });
    } else {
      logger.debug('VAD: Voice detected, proceeding with transcription', {
        confidence: vadResult.confidence?.toFixed(3),
        energy: vadResult.energy?.toFixed(4),
        reason: vadResult.reason
      });
    }
    
    return vadResult;
  }

  /**
   * Perform audio transcription
   * @private
   */
  async _performTranscription(audioFilePath, socket) {
    logger.info('Calling Whisper API...', { audioFilePath });
    socket.emit('processing', { 
      stage: 'transcribing',
      message: 'Transcribing audio...' 
    });

    const transcriptionResult = await this.services.transcription.transcribeAudio(audioFilePath);
    
    logger.info('Whisper API response', { 
      hasText: !!transcriptionResult.text,
      textLength: transcriptionResult.text?.length || 0
    });

    // Skip if silence or empty
    if (transcriptionResult.isSilence || !transcriptionResult.text) {
      logger.warn('Skipping - Whisper returned silence or empty');
      return null;
    }

    return transcriptionResult;
  }

  /**
   * Save transcription to history and emit to client
   * @private
   */
  _saveAndEmitTranscription(transcriptionResult, socket) {
    // Save to meeting history
    this.services.meetingHistory.addTranscription(
      transcriptionResult.text,
      transcriptionResult.timestamp
    );

    // Emit to client
    socket.emit(SOCKET_EVENTS.TRANSCRIPTION, {
      text: transcriptionResult.text,
      timestamp: transcriptionResult.timestamp,
      duration: transcriptionResult.duration,
      cost: transcriptionResult.cost
    });
  }

  /**
   * Generate AI suggestions if enough content is buffered
   * @private
   */
  async _generateSuggestionsIfReady(text, socket) {
    // Skip if stopping
    if (this.state.isStopping) {
      return;
    }
    
    const batchedText = this.services.suggestion.addTranscription(text);
    
    if (batchedText) {
      // We have enough content, generate suggestions
      socket.emit('processing', { 
        stage: 'generating-suggestions',
        message: 'Generating AI suggestions...' 
      });

      try {
        const suggestions = await this.services.suggestion.generateSuggestions(batchedText);

        if (suggestions) {
          // Save to meeting history
          this.services.meetingHistory.addSuggestion(suggestions);
          
          // Emit suggestions
          socket.emit(SOCKET_EVENTS.SUGGESTION, suggestions);
          
          logger.info('AI suggestions generated and sent');
        }
      } catch (error) {
        logger.error('Error generating suggestions', {
          error: error.message
        });
      }
    }
  }

  /**
   * Get current statistics
   * @private
   */
  _getStats() {
    const transcriptionStats = this.services.transcription.getStats();
    const suggestionStats = this.services.suggestion.getStats();
    const audioStats = this.services.audioService?.getStats() || {
      isRecording: false,
      chunkCount: 0,
      chunkDuration: 0
    };
    const queueStats = this.processingQueue.getStats();

    return {
      audio: audioStats,
      transcription: transcriptionStats,
      suggestions: suggestionStats,
      totalCost: transcriptionStats.totalCost + suggestionStats.totalCost,
      isProcessing: this.state.isProcessing,
      sessionDuration: this.state.sessionStartTime 
        ? Date.now() - this.state.sessionStartTime 
        : 0,
      queue: {
        queueSize: queueStats.queueSize,
        processing: queueStats.processing,
        totalQueued: queueStats.totalQueued,
        totalProcessed: queueStats.totalProcessed,
        totalDropped: queueStats.totalDropped,
        totalErrors: queueStats.totalErrors
      }
    };
  }

  /**
   * Cleanup processing queue
   */
  cleanup() {
    this.processingQueue.clear();
    logger.info('Audio processor cleanup complete');
  }
}
