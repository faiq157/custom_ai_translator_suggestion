import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import config from '../config/config.js';
import logger from '../config/logger.js';

class AudioCaptureService {
  constructor() {
    this.chunkDuration = config.audio.chunkDuration;
    this.isRecording = false;
    this.micInstance = null;
    this.micInputStream = null;
    this.currentChunkPath = null;
    this.tempDir = config.paths.tempAudio;
    this.chunkCount = 0;
    this.audioBuffer = [];
    this.chunkTimer = null;
    
    // Create temp directory
    this._ensureTempDirectory();
  }

  _ensureTempDirectory() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      logger.info('Created temp audio directory', { path: this.tempDir });
    } else {
      logger.info('Using temp audio directory', { path: this.tempDir });
    }
  }

  startRecording(callback) {
    if (this.isRecording) {
      logger.warn('Recording already in progress');
      return false;
    }

    this.isRecording = true;
    this.chunkCount = 0;
    logger.info('🎤 Audio capture started', {
      sampleRate: config.audio.sampleRate,
      chunkDuration: this.chunkDuration
    });
    
    this._recordChunks(callback);
    return true;
  }

  _recordChunks(callback) {
    if (!this.isRecording) return;

    try {
      this.chunkCount++;
      const timestamp = Date.now();
      this.currentChunkPath = path.join(this.tempDir, `chunk_${timestamp}.wav`);

      logger.debug('Recording chunk', { 
        chunk: this.chunkCount, 
        path: this.currentChunkPath 
      });

      // Use arecord (ALSA) for high-quality audio recording
      // Don't use -d flag, we'll kill it manually after duration
      
      const args = [
        '-D', config.audio.device,
        '-f', 'S16_LE',  // Signed 16-bit little-endian
        '-c', config.audio.channels.toString(),
        '-r', config.audio.sampleRate.toString(),
        this.currentChunkPath
      ];

      logger.info('🎙️ Starting arecord', { args, duration: this.chunkDuration });

      this.micInstance = spawn('arecord', args);
      
      logger.info('✅ arecord spawned', { pid: this.micInstance.pid });
      
      // Kill arecord after chunk duration and process chunk
      const killTimer = setTimeout(() => {
        logger.info('⏰ Timer fired! Attempting to kill arecord', { 
          duration: this.chunkDuration,
          pid: this.micInstance?.pid,
          killed: this.micInstance?.killed 
        });
        
        if (this.micInstance && !this.micInstance.killed) {
          logger.info('🔪 Killing arecord with SIGINT (Ctrl+C)', { pid: this.micInstance.pid });
          this.micInstance.kill('SIGINT');
          logger.info('✅ Kill signal sent');
          
          // Exit event will handle processing - no need for manual timeout
          // (Keeping this comment for reference - manual processing disabled since EXIT event works)
        } else {
          logger.warn('⚠️ Cannot kill - instance null or already killed');
        }
      }, this.chunkDuration);
      
      logger.info('⏲️ Kill timer set', { duration: this.chunkDuration });

      this.micInstance.on('error', (err) => {
        logger.error('❌ arecord error event', { error: err.message });
      });

      this.micInstance.stderr.on('data', (data) => {
        const message = data.toString();
        // arecord writes normal status to stderr, only log actual errors
        if (message.includes('Error') || message.includes('error') || message.includes('failed')) {
          logger.error('arecord error', { error: message });
        } else {
          logger.debug('arecord status', { message: message.trim() });
        }
      });

      this.micInstance.on('exit', (code, signal) => {
        logger.info('🚶 arecord EXIT event', { code, signal });
        
        // Process chunk on exit since close event may not fire
        if (this.isRecording && fs.existsSync(this.currentChunkPath)) {
          logger.info('✅ Processing audio chunk from EXIT event', { code, path: this.currentChunkPath });
          this._processChunk(callback);
          
          // Record next chunk
          logger.info('🔄 Recording next chunk from EXIT...');
          this._recordChunks(callback);
        }
      });

      this.micInstance.on('close', (code, signal) => {
        logger.info('🚪 arecord process CLOSED!', { 
          code, 
          signal,
          isRecording: this.isRecording,
          chunkPath: this.currentChunkPath,
          fileExists: fs.existsSync(this.currentChunkPath)
        });
        
        // Process chunk if recording is still active and file exists
        // Note: arecord may exit with code 1 when terminated after duration, but file is valid
        if (this.isRecording && fs.existsSync(this.currentChunkPath)) {
          logger.info('✅ Processing audio chunk', { code, path: this.currentChunkPath });
          this._processChunk(callback);
          
          // Record next chunk
          logger.info('🔄 Recording next chunk...');
          this._recordChunks(callback);
        } else if (code !== 0 && !this.isRecording) {
          logger.info('⏹️ arecord terminated (recording stopped)', { code });
        } else if (code !== 0) {
          logger.warn('⚠️ arecord exited with non-zero code', { 
            code,
            chunkPath: this.currentChunkPath,
            fileExists: fs.existsSync(this.currentChunkPath)
          });
        } else {
          logger.warn('❓ Unexpected close state', {
            code,
            isRecording: this.isRecording,
            fileExists: fs.existsSync(this.currentChunkPath)
          });
        }
      });

    } catch (error) {
      logger.error('Error starting recording', { error: error.message });
      this.isRecording = false;
      throw error;
    }
  }

  _processChunk(callback) {
    if (!fs.existsSync(this.currentChunkPath)) {
      logger.warn('Chunk file not found', { path: this.currentChunkPath });
      return;
    }

    const fileSize = fs.statSync(this.currentChunkPath).size;
    
    // Only process if file has content (more than just WAV header ~44 bytes)
    if (fileSize > 1000) {
      logger.info('Audio chunk saved', { 
        size: `${(fileSize / 1024).toFixed(2)} KB`,
        chunk: this.chunkCount,
        path: this.currentChunkPath
      });
      
      // Keep audio chunks for testing - they will NOT be deleted
      
      callback(this.currentChunkPath, fileSize);
    } else {
      logger.debug('Skipping empty chunk', { size: fileSize });
      // Delete empty file
      try {
        fs.unlinkSync(this.currentChunkPath);
      } catch (err) {
        logger.error('Error deleting empty chunk', { error: err.message });
      }
    }
  }

  stopRecording() {
    if (!this.isRecording) {
      logger.warn('No recording in progress');
      return false;
    }

    this.isRecording = false;
    
    // Stop arecord process
    if (this.micInstance) {
      try {
        this.micInstance.kill('SIGTERM');
      } catch (err) {
        logger.error('Error stopping arecord', { error: err.message });
      }
      this.micInstance = null;
    }
    
    logger.info('Audio capture stopped', { totalChunks: this.chunkCount });
    return true;
  }

  cleanup() {
    this.stopRecording();
    
    // KEEP audio files for testing - do NOT delete
    if (fs.existsSync(this.tempDir)) {
      const files = fs.readdirSync(this.tempDir);
      logger.info('Audio files preserved for testing', { 
        count: files.length,
        location: this.tempDir 
      });
      logger.info('To clean up manually, delete files in: ' + this.tempDir);
    }
  }

  getStats() {
    return {
      isRecording: this.isRecording,
      chunkCount: this.chunkCount,
      chunkDuration: this.chunkDuration
    };
  }
}

export default AudioCaptureService;
