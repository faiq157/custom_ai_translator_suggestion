/**
 * Audio Processor
 * Handles audio chunk processing, VAD, transcription, and AI suggestions
 */

import path from 'path';
import logger from '../../config/logger.js';
import { SOCKET_EVENTS, LOG_PREFIX } from '../../constants/index.js';

export class AudioProcessor {
  constructor(services, state) {
    this.services = services;
    this.state = state;
  }

  /**
   * Process a single audio chunk
   * @param {string} audioFilePath - Path to audio file
   * @param {number} fileSize - Size of audio file
   * @param {Object} socket - Socket.io socket instance
   */
  async processAudioChunk(audioFilePath, fileSize, socket) {
    try {
      // Skip if stopping
      if (this.state.isStopping) {
        logger.debug('Recording stopped, skipping audio chunk processing');
        return;
      }

      // Emit audio chunk info
      this._emitAudioChunkInfo(audioFilePath, fileSize, socket);

      // Step 1: Voice Activity Detection
      const vadResult = await this._performVAD(audioFilePath);
      if (!vadResult.hasVoice) {
        return; // Skip if no voice detected
      }

      // Step 2: Transcription
      const transcriptionResult = await this._performTranscription(audioFilePath, socket);
      if (!transcriptionResult || this.state.isStopping) {
        return; // Skip if no transcription or stopping
      }

      // Save and emit transcription
      this._saveAndEmitTranscription(transcriptionResult, socket);

      // Step 3: Generate AI suggestions if enough content
      await this._generateSuggestionsIfReady(transcriptionResult.text, socket);

      // Emit updated stats
      socket.emit(SOCKET_EVENTS.STATS, this._getStats());

    } catch (error) {
      logger.error(`${LOG_PREFIX.ERROR} Error processing audio chunk`, { 
        error: error.message,
        file: audioFilePath 
      });
      
      socket.emit(SOCKET_EVENTS.ERROR, { 
        message: 'Error processing audio', 
        error: error.message 
      });
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
  async _performVAD(audioFilePath) {
    logger.info(`${LOG_PREFIX.AUDIO} Running VAD analysis...`, { audioFilePath });
    const vadResult = await this.services.vad.analyzeAudio(audioFilePath);
    logger.info(`${LOG_PREFIX.AUDIO} VAD analysis complete`, { vadResult });
    
    if (!vadResult.hasVoice) {
      logger.warn(`${LOG_PREFIX.WARNING} VAD: No voice detected, skipping transcription`, {
        confidence: vadResult.confidence,
        energy: vadResult.energy
      });
    } else {
      logger.info(`${LOG_PREFIX.SUCCESS} VAD: Voice detected, proceeding with transcription`, {
        confidence: vadResult.confidence,
        energy: vadResult.energy
      });
    }
    
    return vadResult;
  }

  /**
   * Perform audio transcription
   * @private
   */
  async _performTranscription(audioFilePath, socket) {
    logger.info(`${LOG_PREFIX.TRANSCRIPTION} Calling Whisper API...`, { audioFilePath });
    socket.emit('processing', { 
      stage: 'transcribing',
      message: 'Transcribing audio...' 
    });

    const transcriptionResult = await this.services.transcription.transcribeAudio(audioFilePath);
    
    logger.info(`${LOG_PREFIX.TRANSCRIPTION} Whisper API response`, { 
      isSilence: transcriptionResult.isSilence,
      hasText: !!transcriptionResult.text,
      textLength: transcriptionResult.text?.length || 0,
      text: transcriptionResult.text?.substring(0, 50) || '(empty)'
    });

    // Skip if silence or empty
    if (transcriptionResult.isSilence || !transcriptionResult.text) {
      logger.warn(`${LOG_PREFIX.WARNING} Skipping - Whisper returned silence or empty`, {
        isSilence: transcriptionResult.isSilence,
        hasText: !!transcriptionResult.text
      });
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
      logger.debug('Recording stopped, skipping AI suggestion generation');
      return;
    }
    
    const batchedText = this.services.suggestion.addTranscription(text);
    
    if (batchedText) {
      // We have enough content, generate suggestions
      socket.emit('processing', { 
        stage: 'generating-suggestions',
        message: 'Generating AI suggestions...' 
      });

      const suggestions = await this.services.suggestion.generateSuggestions(batchedText);

      if (suggestions) {
        // Save to meeting history
        this.services.meetingHistory.addSuggestion(suggestions);
        
        // Emit suggestions
        socket.emit(SOCKET_EVENTS.SUGGESTION, suggestions);
        
        logger.info(`${LOG_PREFIX.SUCCESS} AI suggestions generated and sent`);
      }
    } else {
      logger.debug('Buffering transcription, waiting for more context...');
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

    return {
      audio: audioStats,
      transcription: transcriptionStats,
      suggestions: suggestionStats,
      totalCost: transcriptionStats.totalCost + suggestionStats.totalCost,
      isProcessing: this.state.isProcessing,
      sessionDuration: this.state.sessionStartTime 
        ? Date.now() - this.state.sessionStartTime 
        : 0
    };
  }
}
