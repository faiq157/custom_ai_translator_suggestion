/**
 * Application Constants
 * Central location for all magic numbers, strings, and configuration values
 */

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
};

// Socket Events
export const SOCKET_EVENTS = {
  // Client -> Server
  START_SYSTEM_RECORDING: 'start-system-recording',
  STOP_RECORDING: 'stop-recording',
  UPDATE_SETTINGS: 'update-settings',
  CLEAR_CONTEXT: 'clear-context',
  
  // Server -> Client
  STATS: 'stats',
  TRANSCRIPTION: 'transcription',
  SUGGESTION: 'suggestion',
  MEETING_STARTED: 'meeting-started',
  MEETING_ENDED: 'meeting-ended',
  RECORDING_STOPPED: 'recording-stopped',
  SETTINGS_UPDATED: 'settings-updated',
  ERROR: 'error'
};

// Audio Processing
export const AUDIO_CONSTANTS = {
  DEFAULT_SAMPLE_RATE: 16000,
  DEFAULT_CHANNELS: 1,
  DEFAULT_CHUNK_DURATION: 5000, // milliseconds
  MIN_SPEECH_DURATION: 300, // milliseconds
  SILENCE_THRESHOLD: 0.003,
  ENERGY_THRESHOLD: 0.005
};

// Meeting States
export const MEETING_STATE = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PROCESSING: 'processing',
  PAUSED: 'paused',
  STOPPED: 'stopped'
};

// File Paths
export const FILE_EXTENSIONS = {
  AUDIO: '.wav',
  PDF: '.pdf',
  JSON: '.json'
};

// API Endpoints
export const API_ROUTES = {
  HEALTH: '/health',
  INFO: '/api/info',
  SYSTEM_CHECK: '/api/system/check',
  MEETINGS: '/api/meetings',
  AUDIO_DEVICES: '/api/audio/devices',
  EXPORT_TRANSCRIPT: '/api/export/transcript',
  EXPORT_SUGGESTIONS: '/api/export/suggestions',
  EXPORT_COMPLETE: '/api/export/complete-meeting'
};

// Timeouts and Intervals
export const TIMEOUTS = {
  GRACEFUL_SHUTDOWN: 10000, // 10 seconds
  PAUSE_CHECK_INTERVAL: 30000, // 30 seconds
  BATCH_SEND_DELAY: 1000 // 1 second
};

// Batch Processing
export const BATCH_CONSTANTS = {
  MIN_CONTENT_LENGTH: 100, // characters
  MAX_BUFFER_SIZE: 10 // number of transcriptions
};

// Error Messages
export const ERROR_MESSAGES = {
  RECORDING_IN_PROGRESS: 'Recording already in progress',
  NO_RECORDING: 'No recording in progress',
  SYSTEM_CHECK_FAILED: 'System check failed',
  MEETING_NOT_FOUND: 'Meeting not found',
  PDF_NOT_FOUND: 'PDF not found',
  INVALID_DEVICE: 'Invalid audio device',
  TRANSCRIPTION_FAILED: 'Transcription failed',
  SUGGESTION_FAILED: 'Failed to generate suggestions'
};

// Success Messages
export const SUCCESS_MESSAGES = {
  RECORDING_STARTED: 'Recording started successfully',
  RECORDING_STOPPED: 'Recording stopped successfully',
  SETTINGS_UPDATED: 'Settings updated successfully',
  CONTEXT_CLEARED: 'Context cleared successfully'
};

// Log Prefixes (for better log readability)
export const LOG_PREFIX = {
  AUDIO: '🎤',
  TRANSCRIPTION: '📝',
  SUGGESTION: '💡',
  MEETING: '📅',
  ERROR: '❌',
  SUCCESS: '✅',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  TIMER: '⏰',
  PROCESSING: '🚀'
};
