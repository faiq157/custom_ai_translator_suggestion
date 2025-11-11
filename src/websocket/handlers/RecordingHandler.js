/**
 * Recording Handler
 * Handles recording start/stop operations
 */

import logger from '../../config/logger.js';
import { SOCKET_EVENTS, ERROR_MESSAGES, LOG_PREFIX } from '../../constants/index.js';

export class RecordingHandler {
  constructor(services, state) {
    this.services = services;
    this.state = state;
  }

  /**
   * Handle start recording request
   * @param {Object} socket - Socket.io socket instance
   */
  async handleStartRecording(socket) {
    try {
      if (this.state.isProcessing) {
        socket.emit(SOCKET_EVENTS.ERROR, { message: ERROR_MESSAGES.RECORDING_IN_PROGRESS });
        return;
      }

      logger.info('Starting recording session', { socketId: socket.id });
      
      // Update state
      this.state.isProcessing = true;
      this.state.isStopping = false;
      this.state.sessionStartTime = Date.now();

      // Reset stats for new session
      this.services.transcription.resetStats();
      this.services.suggestion.resetStats();
      this.services.suggestion.clearContext();
      
      // Start meeting history
      const meetingId = this.services.meetingHistory.startMeeting();
      socket.emit(SOCKET_EVENTS.MEETING_STARTED, { meetingId });

      // Get audio settings
      const audioSettings = this._getAudioSettings();

      // Start audio capture with callback and user settings
      const started = await this.services.audioCapture.startRecording(
        async (audioFilePath, fileSize, error) => {
          // Handle errors
          if (error || !audioFilePath) {
            logger.error('Audio capture error:', error?.message || 'No audio file path');
            socket.emit(SOCKET_EVENTS.ERROR, { 
              message: error?.message || 'Audio capture failed',
              type: 'audio_capture_error'
            });
            this.state.isProcessing = false;
            return;
          }
          await this._handleAudioChunk(audioFilePath, fileSize, socket);
        },
        this.state.userSettings // Pass user settings for device configuration
      );

      if (started) {
        socket.emit('recording-started', {
          message: 'Recording started',
          timestamp: new Date().toISOString()
        });
        logger.info('Recording started successfully');
      } else {
        throw new Error('Failed to start audio capture');
      }

    } catch (error) {
      logger.error('Error starting recording', { error: error.message });
      this.state.isProcessing = false;
      socket.emit(SOCKET_EVENTS.ERROR, { 
        message: 'Failed to start system recording', 
        error: error.message 
      });
    }
  }

  /**
   * Handle stop recording request
   * @param {Object} socket - Socket.io socket instance
   */
  async handleStopRecording(socket) {
    try {
      logger.info('Stopping recording session', { socketId: socket.id });
      
      // Stop audio capture
      this.services.audioCapture.stopRecording();
      
      // Update state
      this.state.isStopping = true;
      this.state.isProcessing = false;
      
      // Clear any buffered transcriptions
      this.services.suggestion.clearBuffer();
      
      // Wait for processing queue to finish
      if (this.services.audioProcessor && this.services.audioProcessor.processingQueue) {
        logger.info('Waiting for processing queue to finish...');
        await this.services.audioProcessor.processingQueue.waitForCompletion();
        logger.info('Processing queue finished');
      }

      const sessionDuration = this.state.sessionStartTime 
        ? Date.now() - this.state.sessionStartTime 
        : 0;

      // Update meeting metadata
      const stats = this._getStats();
      this.services.meetingHistory.updateMetadata({
        totalChunks: stats.audio.chunkCount,
        totalCost: stats.totalCost
      });

      // End meeting and generate summary
      const meetingData = await this.services.meetingHistory.endMeeting();

      socket.emit(SOCKET_EVENTS.RECORDING_STOPPED, {
        message: 'System recording stopped successfully',
        timestamp: new Date().toISOString(),
        sessionDuration,
        stats,
        meeting: meetingData
      });

      logger.info('Meeting summary generated', { 
        meetingId: meetingData?.meetingId,
        pdfPath: meetingData?.pdfPath 
      });

    } catch (error) {
      logger.error('Error stopping recording', { error: error.message });
      socket.emit(SOCKET_EVENTS.ERROR, { 
        message: 'Failed to stop system recording', 
        error: error.message 
      });
    }
  }

  /**
   * Handle audio chunk processing
   * @private
   */
  async _handleAudioChunk(audioFilePath, fileSize, socket) {
    
    if (!this.state.isProcessing || this.state.isStopping) {
      logger.warn('Skipping chunk - not processing or stopping');
      return;
    }
    
    try {
      await this.services.audioProcessor.processAudioChunk(audioFilePath, fileSize, socket);
    } catch (error) {
      logger.error('Error processing audio chunk', { 
        error: error.message,
        audioFilePath 
      });
    }
  }

  /**
   * Get audio settings
   * @private
   */
  _getAudioSettings() {
    return this.state.userSettings?.audio || {
      device: this.services.config.audio.device,
      sampleRate: this.services.config.audio.sampleRate,
      channels: this.services.config.audio.channels,
      captureMode: 'microphone'
    };
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
