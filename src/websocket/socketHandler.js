/**
 * Socket Handler (Refactored)
 * Main WebSocket connection handler - delegates to specialized handlers
 */

import logger from '../config/logger.js';
import AudioCaptureService from '../services/AudioCaptureService.js';
import WindowsAudioService from '../services/WindowsAudioService.js';
import TranscriptionService from '../services/TranscriptionService.js';
import SuggestionService from '../services/SuggestionService.js';
import MeetingHistoryService from '../services/MeetingHistoryService.js';
import VADService from '../services/VADService.js';
import config from '../config/config.js';
import { SOCKET_EVENTS, LOG_PREFIX } from '../constants/index.js';
import { RecordingHandler } from './handlers/RecordingHandler.js';
import { AudioProcessor } from './handlers/AudioProcessor.js';
import { EventHandlers } from './handlers/EventHandlers.js';

/**
 * Main Socket Handler Class
 * Coordinates WebSocket connections and delegates to specialized handlers
 */
class SocketHandler {
  constructor(io, settingsManager = null) {
    this.io = io;
    this.settingsManager = settingsManager;
    
    // Initialize state
    this.state = {
      userSettings: null,
      isProcessing: false,
      isStopping: false,
      sessionStartTime: null,
      pauseCheckInterval: null
    };
    
    // Initialize services
    // Use platform-specific audio capture
    const isWindows = process.platform === 'win32';
    const AudioService = isWindows ? WindowsAudioService : AudioCaptureService;
    
    logger.info(`🎤 Platform: ${process.platform}`);
    logger.info(`🎤 Audio service: ${AudioService.name}`);
    
    const audioCaptureInstance = new AudioService();
    
    this.services = {
      config,
      audioCapture: audioCaptureInstance,
      transcription: new TranscriptionService(),
      suggestion: new SuggestionService(),
      meetingHistory: new MeetingHistoryService(),
      vad: new VADService()
    };
    
    // Initialize specialized handlers
    this.audioProcessor = new AudioProcessor(this.services, this.state);
    this.services.audioProcessor = this.audioProcessor; // Make available to other handlers
    
    this.recordingHandler = new RecordingHandler(this.services, this.state);
    this.eventHandlers = new EventHandlers(this.services, this.state);
    
    logger.info('✅ Services initialized');
    
    // Setup socket event listeners
    this.setupSocketHandlers();
  }

  /**
   * Setup WebSocket event handlers
   */
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`${LOG_PREFIX.SUCCESS} Client connected`, { socketId: socket.id });

      // Send initial stats
      socket.emit(SOCKET_EVENTS.STATS, this._getStats());

      // ==================== SETTINGS ====================
      socket.on(SOCKET_EVENTS.UPDATE_SETTINGS, (settings) => {
        this.eventHandlers.handleUpdateSettings(settings, socket);
      });

      // ==================== RECORDING ====================
      socket.on(SOCKET_EVENTS.START_SYSTEM_RECORDING, async () => {
        await this.recordingHandler.handleStartRecording(socket);
      });

      socket.on('stop-system-recording', async () => {
        await this.recordingHandler.handleStopRecording(socket);
      });

      // ==================== STATS & CONTEXT ====================
      socket.on('get-stats', () => {
        this.eventHandlers.handleGetStats(socket);
      });

      socket.on(SOCKET_EVENTS.CLEAR_CONTEXT, () => {
        this.eventHandlers.handleClearContext(socket);
      });

      // ==================== DISCONNECT ====================
      socket.on('disconnect', () => {
        this.eventHandlers.handleDisconnect(socket);
      });
    });
  }

  /**
   * Get current statistics
   * @returns {Object} Current system statistics
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

  /**
   * Cleanup resources
   */
  cleanup() {
    // Stop pause detection
    if (this.state.pauseCheckInterval) {
      clearInterval(this.state.pauseCheckInterval);
      this.state.pauseCheckInterval = null;
    }
    
    // Cleanup audio capture
    if (this.services.audioCapture) {
      this.services.audioCapture.cleanup();
    }
    
    logger.info(`${LOG_PREFIX.SUCCESS} Socket handler cleanup complete`);
  }
}

export default SocketHandler;
