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

      logger.info(`${LOG_PREFIX.AUDIO} Starting recording session`, { socketId: socket.id });
      
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

      // Start audio capture with callback
      const started = this.services.audioCapture.startRecording(
        async (audioFilePath, fileSize) => {
          await this._handleAudioChunk(audioFilePath, fileSize, socket);
        }
      );

      if (started) {
        socket.emit('recording-started', {
          message: 'Recording started',
          timestamp: new Date().toISOString()
        });
        logger.info(`${LOG_PREFIX.SUCCESS} Recording started successfully`);
      } else {
        throw new Error('Failed to start audio capture');
      }

    } catch (error) {
      logger.error(`${LOG_PREFIX.ERROR} Error starting recording`, { error: error.message });
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
      logger.info(`${LOG_PREFIX.INFO} Stopping recording session`, { socketId: socket.id });
      
      // Stop audio capture
      this.services.audioCapture.stopRecording();
      
      // Update state
      this.state.isStopping = true;
      this.state.isProcessing = false;
      
      // Clear any buffered transcriptions
      this.services.suggestion.clearBuffer();

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

      logger.info(`${LOG_PREFIX.SUCCESS} Meeting summary generated`, { 
        meetingId: meetingData?.meetingId,
        pdfPath: meetingData?.pdfPath 
      });

    } catch (error) {
      logger.error(`${LOG_PREFIX.ERROR} Error stopping recording`, { error: error.message });
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
    logger.info(`${LOG_PREFIX.PROCESSING} Callback triggered`, { 
      audioFilePath, 
      fileSize,
      isProcessing: this.state.isProcessing,
      isStopping: this.state.isStopping
    });
    
    if (!this.state.isProcessing || this.state.isStopping) {
      logger.warn(`${LOG_PREFIX.WARNING} Skipping chunk - not processing or stopping`);
      return;
    }
    
    try {
      logger.info(`${LOG_PREFIX.PROCESSING} Starting to process audio chunk`, { audioFilePath });
      await this.services.audioProcessor.processAudioChunk(audioFilePath, fileSize, socket);
      logger.info(`${LOG_PREFIX.SUCCESS} Chunk processing complete`);
    } catch (error) {
      logger.error(`${LOG_PREFIX.ERROR} Error processing audio chunk`, { 
        error: error.message,
        stack: error.stack,
        file: audioFilePath 
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
