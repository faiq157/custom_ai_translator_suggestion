import logger from '../config/logger.js';
import AudioCaptureService from '../services/AudioCaptureService.js';
import TranscriptionService from '../services/TranscriptionService.js';
import SuggestionService from '../services/SuggestionService.js';
import MeetingHistoryService from '../services/MeetingHistoryService.js';
import path from 'path';
import fs from 'fs';

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.audioCapture = new AudioCaptureService();
    this.transcription = new TranscriptionService();
    this.suggestion = new SuggestionService();
    this.meetingHistory = new MeetingHistoryService();
    this.isProcessing = false;
    this.isStopping = false;
    this.sessionStartTime = null;
    this.pauseCheckInterval = null;
    this.setupSocketHandlers();
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('Client connected', { socketId: socket.id });

      // Send initial stats
      socket.emit('stats', this.getStats());

      // Handle start recording (browser-based)
      socket.on('start-recording', async () => {
        try {
          if (this.isProcessing) {
            socket.emit('error', { message: 'Recording already in progress' });
            return;
          }

          logger.info('Starting recording session (browser audio)', { socketId: socket.id });
          this.isProcessing = true;
          this.isStopping = false;
          this.sessionStartTime = Date.now();

          // Reset stats for new session
          this.transcription.resetStats();
          this.suggestion.resetStats();
          this.suggestion.clearContext();
          
          // Start meeting history
          const meetingId = this.meetingHistory.startMeeting();
          socket.emit('meeting-started', { meetingId });

          // Start pause detection timer
          this.startPauseDetection(socket);
          
          socket.emit('recording-started', {
            message: 'Recording started successfully',
            timestamp: new Date().toISOString()
          });

        } catch (error) {
          logger.error('Error starting recording', { error: error.message });
          this.isProcessing = false;
          socket.emit('error', { 
            message: 'Failed to start recording', 
            error: error.message 
          });
        }
      });

      // Handle audio data from browser
      socket.on('audio-data', async (data) => {
        try {
          if (!this.isProcessing || this.isStopping) {
            return;
          }

          const { audio, timestamp } = data;
          
          // Convert base64 to buffer
          const audioBuffer = Buffer.from(audio, 'base64');
          
          // Save to temp file
          const tempFilePath = path.join(
            process.cwd(), 
            'temp_audio', 
            `chunk_${Date.now()}.webm`
          );
          
          fs.writeFileSync(tempFilePath, audioBuffer);
          
          logger.debug('Received audio chunk from browser', { 
            size: `${(audioBuffer.length / 1024).toFixed(2)} KB`,
            file: tempFilePath 
          });

          // Process the audio chunk
          await this.processAudioChunk(tempFilePath, audioBuffer.length, socket);

        } catch (error) {
          logger.error('Error processing browser audio', { error: error.message });
          socket.emit('error', { 
            message: 'Error processing audio', 
            error: error.message 
          });
        }
      });

      // Handle stop recording
      socket.on('stop-recording', async () => {
        try {
          logger.info('Stopping recording session (browser audio)', { socketId: socket.id });
          
          // Set stopping flag to prevent new AI requests
          this.isStopping = true;
          this.isProcessing = false;
          
          // Clear any buffered transcriptions
          this.suggestion.clearBuffer();
          
          // Stop pause detection
          this.stopPauseDetection();

          const sessionDuration = this.sessionStartTime 
            ? Date.now() - this.sessionStartTime 
            : 0;

          // Update meeting metadata and end meeting
          const stats = this.getStats();
          this.meetingHistory.updateMetadata({
            totalChunks: 0, // Browser-based recording doesn't use chunk count
            totalCost: stats.totalCost
          });

          const meetingData = await this.meetingHistory.endMeeting();

          socket.emit('recording-stopped', {
            message: 'Recording stopped successfully',
            timestamp: new Date().toISOString(),
            sessionDuration,
            stats: stats,
            meeting: meetingData
          });

          logger.info('Meeting summary generated', { 
            meetingId: meetingData?.meetingId,
            pdfPath: meetingData?.pdfPath 
          });

        } catch (error) {
          logger.error('Error stopping recording', { error: error.message, stack: error.stack });
          socket.emit('error', { 
            message: 'Failed to stop recording', 
            error: error.message 
          });
        }
      });

      // Handle get stats
      socket.on('get-stats', () => {
        socket.emit('stats', this.getStats());
      });

      // Handle clear context
      socket.on('clear-context', () => {
        this.suggestion.clearContext();
        socket.emit('context-cleared', {
          message: 'Conversation context cleared',
          timestamp: new Date().toISOString()
        });
        logger.info('Context cleared', { socketId: socket.id });
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        logger.info('Client disconnected', { socketId: socket.id });
        
        // Clean up if client disconnects during recording
        if (this.isProcessing) {
          this.isStopping = true;
          this.isProcessing = false;
          this.stopPauseDetection();
          logger.info('Recording cleaned up after disconnect');
        }
      });
    });
  }

  async processAudioChunk(audioFilePath, fileSize, socket) {
    try {
      // Skip processing if recording is being stopped
      if (this.isStopping) {
        logger.debug('Recording stopped, skipping audio chunk processing');
        return;
      }

      // Emit audio chunk info for playback
      const chunkId = path.basename(audioFilePath, '.wav');
      socket.emit('audio-chunk', {
        chunkId,
        filePath: audioFilePath,
        fileSize,
        timestamp: new Date().toISOString()
      });

      // Step 1: Transcribe audio
      socket.emit('processing', { 
        stage: 'transcribing',
        message: 'Transcribing audio...' 
      });

      const transcriptionResult = await this.transcription.transcribeAudio(audioFilePath);

      // Skip if silence detected or if stopping
      if (transcriptionResult.isSilence || !transcriptionResult.text || this.isStopping) {
        logger.debug('Silence detected or stopping, skipping transcription and AI processing');
        return;
      }

      // Save to meeting history
      this.meetingHistory.addTranscription(
        transcriptionResult.text,
        transcriptionResult.timestamp
      );

      // Emit transcription to client
      socket.emit('transcription', {
        text: transcriptionResult.text,
        timestamp: transcriptionResult.timestamp,
        duration: transcriptionResult.duration,
        cost: transcriptionResult.cost
      });

      // Step 2: Add to buffer and check if we should generate suggestions
      // Skip if recording is being stopped
      if (this.isStopping) {
        logger.debug('Recording stopped, skipping AI suggestion generation');
        return;
      }
      
      const batchedText = this.suggestion.addTranscription(transcriptionResult.text);
      
      if (batchedText) {
        // We have enough meaningful content, generate suggestions
        socket.emit('processing', { 
          stage: 'generating-suggestions',
          message: 'Generating AI suggestions...' 
        });

        const suggestions = await this.suggestion.generateSuggestions(batchedText);

        if (suggestions) {
          // Save to meeting history
          this.meetingHistory.addSuggestion(suggestions);
          
          // Emit suggestions
          socket.emit('suggestions', suggestions);
        }
      } else {
        logger.debug('Buffering transcription, waiting for more context...');
      }

      // Emit updated stats
      socket.emit('stats', this.getStats());

    } catch (error) {
      logger.error('Error processing audio chunk', { 
        error: error.message,
        file: audioFilePath 
      });
      
      socket.emit('error', { 
        message: 'Error processing audio', 
        error: error.message 
      });
    }
  }

  getStats() {
    const transcriptionStats = this.transcription.getStats();
    const suggestionStats = this.suggestion.getStats();
    const audioStats = this.audioCapture.getStats();

    return {
      audio: audioStats,
      transcription: transcriptionStats,
      suggestions: suggestionStats,
      totalCost: transcriptionStats.totalCost + suggestionStats.totalCost,
      isProcessing: this.isProcessing,
      sessionDuration: this.sessionStartTime 
        ? Date.now() - this.sessionStartTime 
        : 0
    };
  }

  startPauseDetection(socket) {
    // Check every 2 seconds if there's been a pause
    this.pauseCheckInterval = setInterval(async () => {
      // Skip if recording is being stopped
      if (this.isStopping) {
        return;
      }
      
      const batchedText = this.suggestion.checkPauseTimeout();
      
      if (batchedText) {
        logger.info('Pause detected, generating suggestions for buffered content');
        
        socket.emit('processing', { 
          stage: 'generating-suggestions',
          message: 'Generating AI suggestions...' 
        });
        
        try {
          const suggestions = await this.suggestion.generateSuggestions(batchedText);
          
          if (suggestions) {
            this.meetingHistory.addSuggestion(suggestions);
            socket.emit('suggestions', suggestions);
          }
          
          socket.emit('stats', this.getStats());
        } catch (error) {
          logger.error('Error generating suggestions on pause', { error: error.message });
        }
      }
    }, 2000);
  }
  
  stopPauseDetection() {
    if (this.pauseCheckInterval) {
      clearInterval(this.pauseCheckInterval);
      this.pauseCheckInterval = null;
      logger.debug('Pause detection stopped');
    }
  }

  cleanup() {
    this.stopPauseDetection();
    this.audioCapture.cleanup();
    logger.info('Socket handler cleanup complete');
  }
}

export default SocketHandler;
