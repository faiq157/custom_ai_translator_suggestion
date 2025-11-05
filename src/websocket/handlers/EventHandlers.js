/**
 * Event Handlers
 * Handles misc socket events like stats, settings, context clearing
 */

import logger from '../../config/logger.js';
import { SOCKET_EVENTS, SUCCESS_MESSAGES, LOG_PREFIX } from '../../constants/index.js';

export class EventHandlers {
  constructor(services, state) {
    this.services = services;
    this.state = state;
  }

  /**
   * Handle settings update
   * @param {Object} settings - User settings
   * @param {Object} socket - Socket.io socket instance
   */
  handleUpdateSettings(settings, socket) {
    this.state.userSettings = settings;
    
    // Update VAD configuration if provided
    if (settings.audio?.vad) {
      const vadConfig = settings.audio.vad;
      
      // Update VAD enabled state
      this.state.vadEnabled = vadConfig.enabled !== false;
      
      // Update VAD service configuration
      if (this.services.vad) {
        this.services.vad.updateConfig({
          energyThreshold: vadConfig.energyThreshold,
          minSpeechDuration: vadConfig.minSpeechDuration,
          silenceThreshold: vadConfig.silenceThreshold
        });
        
        logger.info('VAD configuration updated from settings', {
          enabled: this.state.vadEnabled,
          energyThreshold: vadConfig.energyThreshold,
          minSpeechDuration: vadConfig.minSpeechDuration,
          silenceThreshold: vadConfig.silenceThreshold
        });
      }
    }
    
    logger.info('User settings updated');
    
    socket.emit(SOCKET_EVENTS.SETTINGS_UPDATED, { 
      success: true,
      message: SUCCESS_MESSAGES.SETTINGS_UPDATED
    });
  }

  /**
   * Handle get stats request
   * @param {Object} socket - Socket.io socket instance
   */
  handleGetStats(socket) {
    socket.emit(SOCKET_EVENTS.STATS, this._getStats());
  }

  /**
   * Handle clear context request
   * @param {Object} socket - Socket.io socket instance
   */
  handleClearContext(socket) {
    this.services.suggestion.clearContext();
    
    socket.emit('context-cleared', {
      message: SUCCESS_MESSAGES.CONTEXT_CLEARED,
      timestamp: new Date().toISOString()
    });
    
    logger.info('Context cleared', { socketId: socket.id });
  }

  /**
   * Handle client disconnect
   * @param {Object} socket - Socket.io socket instance
   */
  handleDisconnect(socket) {
    logger.info('Client disconnected', { socketId: socket.id });
    
    // Clean up if client disconnects during recording
    if (this.state.isProcessing) {
      this.state.isStopping = true;
      this.state.isProcessing = false;
      this._stopPauseDetection();
      logger.info('Recording cleaned up after disconnect');
    }
  }

  /**
   * Start pause detection interval
   * @param {Object} socket - Socket.io socket instance
   */
  startPauseDetection(socket) {
    // Check every 2 seconds if there's been a pause
    this.state.pauseCheckInterval = setInterval(async () => {
      // Skip if recording is being stopped
      if (this.state.isStopping) {
        return;
      }
      
      const batchedText = this.services.suggestion.checkPauseTimeout();
      
      if (batchedText) {
        logger.info('Pause detected, generating suggestions for buffered content');
        
        socket.emit('processing', { 
          stage: 'generating-suggestions',
          message: 'Generating AI suggestions...' 
        });
        
        try {
          const suggestions = await this.services.suggestion.generateSuggestions(batchedText);
          
          if (suggestions) {
            this.services.meetingHistory.addSuggestion(suggestions);
            socket.emit(SOCKET_EVENTS.SUGGESTION, suggestions);
          }
          
          socket.emit(SOCKET_EVENTS.STATS, this._getStats());
        } catch (error) {
          logger.error('Error generating suggestions on pause', { 
            error: error.message 
          });
        }
      }
    }, 2000);
  }

  /**
   * Stop pause detection interval
   * @private
   */
  _stopPauseDetection() {
    if (this.state.pauseCheckInterval) {
      clearInterval(this.state.pauseCheckInterval);
      this.state.pauseCheckInterval = null;
      logger.debug('Pause detection stopped');
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
