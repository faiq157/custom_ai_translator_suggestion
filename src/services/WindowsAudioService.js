import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import config from '../config/config.js';
import logger from '../config/logger.js';

/**
 * Windows Audio Capture Service
 * Captures both microphone and system audio using ffmpeg
 */
class WindowsAudioService {
  constructor() {
    logger.info('🪟 WINDOWS AUDIO SERVICE CONSTRUCTOR CALLED');
    logger.info('Platform:', process.platform);
    
    this.chunkDuration = config.audio.chunkDuration;
    this.isRecording = false;
    this.recordProcess = null;
    this.currentChunkPath = null;
    this.tempDir = config.paths.tempAudio;
    this.chunkCount = 0;
    this.callback = null;
    
    logger.info('Windows Audio Service initialized', {
      tempDir: this.tempDir,
      chunkDuration: this.chunkDuration
    });
    
    this._ensureTempDirectory();
  }

  _ensureTempDirectory() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      logger.info('Created temp audio directory', { path: this.tempDir });
    }
  }

  startRecording(callback) {
    if (this.isRecording) {
      logger.warn('⚠️ Recording already in progress');
      return false;
    }

    logger.info('═══════════════════════════════════════════════════════');
    logger.info('🎤 WINDOWS AUDIO CAPTURE STARTING');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('Platform:', process.platform);
    logger.info('Node version:', process.version);
    logger.info('Temp directory:', this.tempDir);
    logger.info('Sample rate:', config.audio.sampleRate);
    logger.info('Chunk duration:', this.chunkDuration, 'ms');
    logger.info('Channels:', config.audio.channels);
    logger.info('═══════════════════════════════════════════════════════');

    this.isRecording = true;
    this.chunkCount = 0;
    this.callback = callback;
    
    logger.info('✅ Recording state set to true');
    logger.info('✅ Callback registered:', !!callback);
    
    this._recordChunk();
    return true;
  }

  _recordChunk() {
    if (!this.isRecording) {
      logger.warn('⚠️ _recordChunk called but isRecording is false');
      return;
    }

    try {
      this.chunkCount++;
      const timestamp = Date.now();
      this.currentChunkPath = path.join(this.tempDir, `chunk_${timestamp}.wav`);

      logger.info('───────────────────────────────────────────────────────');
      logger.info('🎙️ RECORDING CHUNK #' + this.chunkCount);
      logger.info('───────────────────────────────────────────────────────');
      logger.info('Timestamp:', timestamp);
      logger.info('Output path:', this.currentChunkPath);
      logger.info('Temp dir exists:', fs.existsSync(this.tempDir));
      logger.info('Is recording:', this.isRecording);

      // Use ffmpeg to capture from Stereo Mix (system audio + mic)
      // Stereo Mix must be enabled in Windows Sound Settings
      const ffmpegArgs = [
        '-f', 'dshow',
        '-i', 'audio=Stereo Mix',  // Captures everything playing (including mic if configured)
        '-t', (this.chunkDuration / 1000).toString(),
        '-ar', config.audio.sampleRate.toString(),
        '-ac', config.audio.channels.toString(),
        '-acodec', 'pcm_s16le',
        '-y',
        this.currentChunkPath
      ];

      const commandString = 'ffmpeg ' + ffmpegArgs.join(' ');
      logger.info('🎙️ ffmpeg command:', commandString);
      logger.info('Command length:', commandString.length);
      logger.info('Args count:', ffmpegArgs.length);

      logger.info('🚀 Spawning ffmpeg process...');
      this.recordProcess = spawn('ffmpeg', ffmpegArgs, {
        windowsHide: true,
        shell: false
      });

      logger.info('✅ ffmpeg process spawned');
      logger.info('Process PID:', this.recordProcess.pid);
      logger.info('Process killed:', this.recordProcess.killed);

      let stderr = '';
      let stdout = '';
      let dataReceived = false;

      this.recordProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        dataReceived = true;
        logger.info('📤 ffmpeg stdout:', data.toString().trim());
      });

      this.recordProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        const output = data.toString();
        dataReceived = true;
        
        // Log ALL ffmpeg output for debugging
        logger.info('📥 ffmpeg stderr:', output.trim());
        
        // Check for specific errors
        if (output.includes('Could not find') || output.includes('Cannot find')) {
          logger.error('═══════════════════════════════════════════════════════');
          logger.error('❌ ERROR: Stereo Mix not found!');
          logger.error('═══════════════════════════════════════════════════════');
          logger.error('📖 SOLUTION:');
          logger.error('1. Right-click speaker icon in taskbar');
          logger.error('2. Click "Sounds" → "Recording" tab');
          logger.error('3. Right-click → "Show Disabled Devices"');
          logger.error('4. Right-click "Stereo Mix" → "Enable"');
          logger.error('5. Set as default device');
          logger.error('═══════════════════════════════════════════════════════');
        } else if (output.includes('Cannot open')) {
          logger.error('❌ Cannot open audio device!');
          logger.error('💡 Another app may be using it (close Zoom/Teams/Discord)');
        } else if (output.includes('size=')) {
          logger.info('✅ Recording in progress:', output.trim());
        } else if (output.includes('Input #0')) {
          logger.info('✅ Audio input detected!');
        } else if (output.includes('Stream #0')) {
          logger.info('✅ Audio stream opened!');
        }
      });

      this.recordProcess.on('error', (error) => {
        logger.error('═══════════════════════════════════════════════════════');
        logger.error('❌ PROCESS SPAWN ERROR');
        logger.error('═══════════════════════════════════════════════════════');
        logger.error('Error message:', error.message);
        logger.error('Error code:', error.code);
        logger.error('Error stack:', error.stack);
        logger.error('═══════════════════════════════════════════════════════');
        
        if (error.code === 'ENOENT') {
          logger.error('❌ ffmpeg not found in PATH!');
          logger.error('📖 SOLUTION:');
          logger.error('1. Download: https://www.gyan.dev/ffmpeg/builds/');
          logger.error('2. Extract to C:\\ffmpeg');
          logger.error('3. Add C:\\ffmpeg\\bin to Windows PATH');
          logger.error('4. Restart Command Prompt and test: ffmpeg -version');
        }
      });

      this.recordProcess.on('exit', (code, signal) => {
        logger.info('═══════════════════════════════════════════════════════');
        logger.info('🏁 FFMPEG PROCESS EXITED');
        logger.info('═══════════════════════════════════════════════════════');
        logger.info('Exit code:', code);
        logger.info('Signal:', signal);
        logger.info('Chunk #:', this.chunkCount);
        logger.info('Data received:', dataReceived);
        logger.info('File path:', this.currentChunkPath);
        logger.info('File exists:', fs.existsSync(this.currentChunkPath));
        
        if (fs.existsSync(this.currentChunkPath)) {
          const stats = fs.statSync(this.currentChunkPath);
          logger.info('File size:', stats.size, 'bytes');
          logger.info('File size KB:', (stats.size / 1024).toFixed(2), 'KB');
        }
        
        logger.info('stderr length:', stderr.length);
        logger.info('stdout length:', stdout.length);
        logger.info('═══════════════════════════════════════════════════════');
        
        if (code === 0 && fs.existsSync(this.currentChunkPath)) {
          const stats = fs.statSync(this.currentChunkPath);
          const fileSizeKB = (stats.size / 1024).toFixed(2);
          
          logger.info('✅✅✅ SUCCESS! Audio chunk saved ✅✅✅');
          logger.info('Size:', fileSizeKB, 'KB');
          logger.info('Path:', this.currentChunkPath);

          // Call callback with audio file
          if (this.callback) {
            logger.info('🔔 Calling callback with audio file...');
            this.callback(this.currentChunkPath, stats.size);
            logger.info('✅ Callback executed');
          } else {
            logger.warn('⚠️ No callback registered!');
          }

          // Record next chunk
          if (this.isRecording) {
            logger.info('🔄 Scheduling next chunk in 100ms...');
            setTimeout(() => this._recordChunk(), 100);
          } else {
            logger.info('🛑 Recording stopped, not scheduling next chunk');
          }
        } else {
          logger.error('═══════════════════════════════════════════════════════');
          logger.error('❌❌❌ FAILED TO CREATE AUDIO CHUNK ❌❌❌');
          logger.error('═══════════════════════════════════════════════════════');
          logger.error('Exit code:', code);
          logger.error('File path:', this.currentChunkPath);
          logger.error('File exists:', fs.existsSync(this.currentChunkPath));
          logger.error('Data received:', dataReceived);
          logger.error('stderr (first 1000 chars):', stderr.substring(0, 1000));
          logger.error('stdout (first 1000 chars):', stdout.substring(0, 1000));
          logger.error('═══════════════════════════════════════════════════════');
          
          if (stderr.includes('Stereo Mix') || stderr.includes('Could not find')) {
            logger.error('💡 SOLUTION: Enable Stereo Mix');
            logger.error('1. Right-click speaker icon in taskbar');
            logger.error('2. Click "Sounds" → "Recording" tab');
            logger.error('3. Right-click → "Show Disabled Devices"');
            logger.error('4. Right-click "Stereo Mix" → "Enable"');
            logger.error('5. Set as default device');
          }
          
          if (!dataReceived) {
            logger.error('⚠️ No data received from ffmpeg!');
            logger.error('💡 Possible causes:');
            logger.error('1. ffmpeg not in PATH');
            logger.error('2. Audio device not available');
            logger.error('3. Permissions issue');
          }
          
          // Retry after delay
          if (this.isRecording) {
            logger.info('🔄 Retrying in 2 seconds...');
            setTimeout(() => this._recordChunk(), 2000);
          }
        }
      });

    } catch (error) {
      logger.error('❌ Error recording chunk:', { error: error.message });
      if (this.isRecording) {
        setTimeout(() => this._recordChunk(), 2000);
      }
    }
  }

  stopRecording() {
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('🛑 STOPPING WINDOWS AUDIO CAPTURE');
    logger.info('═══════════════════════════════════════════════════════');
    logger.info('Was recording:', this.isRecording);
    logger.info('Chunk count:', this.chunkCount);
    logger.info('Has process:', !!this.recordProcess);
    
    this.isRecording = false;
    logger.info('✅ Recording state set to false');

    if (this.recordProcess) {
      logger.info('🔪 Killing ffmpeg process...');
      logger.info('Process PID:', this.recordProcess.pid);
      logger.info('Process killed:', this.recordProcess.killed);
      
      try {
        this.recordProcess.kill('SIGTERM');
        logger.info('✅ Kill signal sent to process');
      } catch (error) {
        logger.error('❌ Error killing process:', error.message);
        logger.error('Error stack:', error.stack);
      }
      this.recordProcess = null;
      logger.info('✅ Process reference cleared');
    } else {
      logger.info('ℹ️ No process to kill');
    }
    
    logger.info('═══════════════════════════════════════════════════════');
  }

  getStats() {
    return {
      isRecording: this.isRecording,
      chunkCount: this.chunkCount,
      chunkDuration: this.chunkDuration
    };
  }

  cleanup() {
    this.stopRecording();
  }
}

export default WindowsAudioService;
