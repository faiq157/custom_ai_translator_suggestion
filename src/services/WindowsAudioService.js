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
    this.chunkDuration = config.audio.chunkDuration;
    this.isRecording = false;
    this.recordProcess = null;
    this.currentChunkPath = null;
    this.tempDir = config.paths.tempAudio;
    this.chunkCount = 0;
    this.callback = null;
    this.audioDevice = null;
    
    logger.info('🪟 Windows audio service ready');
    
    this._ensureTempDirectory();
  }

  _ensureTempDirectory() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      logger.info('Created temp audio directory', { path: this.tempDir });
    }
  }

  async startRecording(callback, userSettings = null) {
    if (this.isRecording) {
      logger.warn('⚠️ Recording already in progress');
      return false;
    }

    logger.info('🎤 WINDOWS AUDIO CAPTURE STARTING');
    logger.info(`Sample rate: ${config.audio.sampleRate}`);
    logger.info(`Chunk duration: ${this.chunkDuration} ms`);

    // Get device from settings or auto-detect
    const configuredDevice = userSettings?.audio?.device;
    
    if (configuredDevice && configuredDevice !== 'auto') {
      // Use configured device
      this.audioDevice = configuredDevice;
      logger.info('✅ Using configured device:', this.audioDevice);
    } else {
      // Auto-detect devices
      await this._listAudioDevices();
    }

    this.isRecording = true;
    this.chunkCount = 0;
    this.callback = callback;
    
    logger.info('✅ Recording started');
    
    this._recordChunk();
    return true;
  }

  async _listAudioDevices() {
    return new Promise((resolve) => {
      logger.info('🔍 Detecting audio devices...');
      
      // Use correct ffmpeg command to list DirectShow devices
      const listProcess = spawn('ffmpeg', [
        '-f', 'dshow',
        '-list_devices', 'true',
        '-i', 'dummy'
      ], {
        windowsHide: true,
        shell: false
      });

      let output = '';

      listProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      listProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      listProcess.on('exit', () => {
        // Log raw output for debugging - show actual content
        if (output.length > 0) {
          // Split into lines and show all lines that might contain device info
          const lines = output.split('\n');
          logger.info('=== FFMPEG OUTPUT START ===');
          lines.forEach((line, index) => {
            if (line.trim()) {
              // Highlight lines with quotes (device names)
              if (line.includes('"')) {
                logger.info(`>>> ${line.trim()}`);
              } else if (line.toLowerCase().includes('audio') || 
                         line.toLowerCase().includes('device') ||
                         line.toLowerCase().includes('dshow')) {
                logger.info(`*** ${line.trim()}`);
              } else if (index < 30) { // Show first 30 lines
                logger.info(`    ${line.trim()}`);
              }
            }
          });
          logger.info('=== FFMPEG OUTPUT END ===');
        } else {
          logger.warn('⚠️ No output from ffmpeg!');
        }

        // Parse audio devices from output - try multiple patterns
        const lines = output.split('\n');
        const audioDevices = [];
        
        let inAudioSection = false;
        for (const line of lines) {
          // Look for DirectShow audio devices section
          if (line.includes('DirectShow audio devices') || 
              line.includes('dshow @ ') && line.toLowerCase().includes('audio')) {
            inAudioSection = true;
            logger.info('✅ Found DirectShow audio devices section');
            continue;
          }
          
          // End of audio section
          if (inAudioSection && (line.includes('DirectShow video devices') || 
                                  line.includes('dshow @ ') && line.toLowerCase().includes('video'))) {
            logger.info('End of audio devices section');
            break;
          }
          
          // Extract device names - look for quoted strings in audio section
          if (inAudioSection && line.includes('"')) {
            const match = line.match(/"([^"]+)"/);
            if (match && match[1] !== 'dummy') {
              audioDevices.push(match[1]);
              logger.info(`  📱 Found device: ${match[1]}`);
            }
          }
        }

        logger.info(`✅ Available audio devices: ${audioDevices.length}`);
        
        if (audioDevices.length === 0) {
          logger.error('❌ No audio devices detected by ffmpeg!');
          logger.error('💡 This usually means:');
          logger.error('1. ffmpeg is not properly installed');
          logger.error('2. No audio devices are available');
          logger.error('3. DirectShow drivers are missing');
          // Use fallback
          this.audioDevice = null;
          resolve();
          return;
        }

        audioDevices.forEach((device, index) => {
          logger.info(`  ${index + 1}. ${device}`);
        });

        // Find Stereo Mix
        this.audioDevice = audioDevices.find(d => 
          d.toLowerCase().includes('stereo mix') || 
          d.toLowerCase().includes('wave out mix') ||
          d.toLowerCase().includes('what u hear')
        );

        if (this.audioDevice) {
          logger.info(`✅ Using device: ${this.audioDevice}`);
        } else {
          logger.warn('⚠️ Stereo Mix not found, using first available device');
          this.audioDevice = audioDevices[0];
          logger.info(`Using device: ${this.audioDevice}`);
        }

        resolve();
      });

      listProcess.on('error', (error) => {
        logger.error(`❌ Failed to spawn ffmpeg: ${error.message}`);
        if (error.code === 'ENOENT') {
          logger.error('❌ ffmpeg not found in PATH!');
          logger.error('💡 Download from: https://www.gyan.dev/ffmpeg/builds/');
        }
        this.audioDevice = null;
        resolve();
      });
    });
  }

  _recordChunk() {
    if (!this.isRecording) return;

    // Check if we have a valid device
    if (!this.audioDevice) {
      logger.error('❌ No audio device available - cannot record');
      logger.error('💡 Please check:');
      logger.error('1. ffmpeg is installed and in PATH');
      logger.error('2. Audio devices are enabled in Windows Sound Settings');
      logger.error('3. Enable "Stereo Mix" for system audio capture');
      this.isRecording = false;
      return;
    }

    try {
      this.chunkCount++;
      const timestamp = Date.now();
      this.currentChunkPath = path.join(this.tempDir, `chunk_${timestamp}.wav`);

      logger.info(`🎙️ Recording chunk #${this.chunkCount}`);

      // Use detected audio device
      const audioInput = `audio=${this.audioDevice}`;
      
      const ffmpegArgs = [
        '-f', 'dshow',
        '-i', audioInput,
        '-t', (this.chunkDuration / 1000).toString(),
        '-ar', config.audio.sampleRate.toString(),
        '-ac', config.audio.channels.toString(),
        '-acodec', 'pcm_s16le',
        '-y',
        this.currentChunkPath
      ];

      logger.info(`🎙️ Device: ${this.audioDevice}`);

      this.recordProcess = spawn('ffmpeg', ffmpegArgs, {
        windowsHide: true,
        shell: false
      });

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
        
        // Check for specific errors
        if (output.includes('Could not find') || output.includes('Cannot find')) {
          logger.error('❌ Audio device not found!');
          logger.error('💡 Enable Stereo Mix in Sound Settings');
        } else if (output.includes('Cannot open')) {
          logger.error('❌ Cannot open audio device!');
          logger.error('💡 Close other apps using microphone');
        } else if (output.includes('size=')) {
          const sizeMatch = output.match(/size=\s*(\d+)kB/);
          if (sizeMatch) {
            logger.info('✅ Recording:', sizeMatch[1] + 'kB');
          }
        } else if (output.includes('Input #0')) {
          logger.info('✅ Audio input detected');
        } else if (output.includes('Stream #0')) {
          logger.info('✅ Audio stream opened');
        }
      });

      this.recordProcess.on('error', (error) => {
        logger.error('❌ Process error:', error.message);
        
        if (error.code === 'ENOENT') {
          logger.error('❌ ffmpeg not found in PATH!');
          logger.error('💡 Download from: https://www.gyan.dev/ffmpeg/builds/');
        }
      });

      this.recordProcess.on('exit', (code, signal) => {
        const fileExists = fs.existsSync(this.currentChunkPath);
        
        if (code === 0 && fileExists) {
          const stats = fs.statSync(this.currentChunkPath);
          const fileSizeKB = (stats.size / 1024).toFixed(2);
          
          logger.info(`✅ Chunk saved: ${fileSizeKB} KB`);

          // Call callback with audio file
          if (this.callback) {
            this.callback(this.currentChunkPath, stats.size);
          }

          // Record next chunk
          if (this.isRecording) {
            setTimeout(() => this._recordChunk(), 100);
          }
        } else {
          logger.error('❌ Failed to create chunk');
          logger.error(`Exit code: ${code}`);
          logger.error(`File exists: ${fileExists}`);
          
          if (stderr.includes('Could not find')) {
            logger.error('💡 Enable Stereo Mix in Sound Settings');
          }
          
          if (!dataReceived) {
            logger.error('💡 No data from ffmpeg - check device');
            logger.error(`stderr: ${stderr.substring(0, 200)}`);
          }
          
          // Retry after delay
          if (this.isRecording) {
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
    logger.info('🛑 Stopping recording');
    logger.info(`Chunks recorded: ${this.chunkCount}`);
    
    this.isRecording = false;

    if (this.recordProcess) {
      try {
        this.recordProcess.kill('SIGTERM');
        logger.info('✅ Process stopped');
      } catch (error) {
        logger.error(`❌ Error stopping process: ${error.message}`);
      }
      this.recordProcess = null;
    }
  }

  getStats() {
    return {
      isRecording: this.isRecording,
      chunkCount: this.chunkCount,
      chunkDuration: this.chunkDuration
    };
  }

  /**
   * Get list of available audio devices
   * @returns {Promise<Array>} List of device names
   */
  async getAvailableDevices() {
    return new Promise((resolve) => {
      logger.info('🔍 Listing audio devices...');
      
      const listProcess = spawn('ffmpeg', ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], {
        windowsHide: true,
        shell: false
      });

      let output = '';

      listProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      listProcess.on('exit', () => {
        const lines = output.split('\n');
        const audioDevices = [];
        
        let inAudioSection = false;
        for (const line of lines) {
          if (line.includes('DirectShow audio devices')) {
            inAudioSection = true;
            continue;
          }
          if (inAudioSection && line.includes('DirectShow video devices')) {
            break;
          }
          if (inAudioSection && line.includes('"')) {
            const match = line.match(/"([^"]+)"/);
            if (match) {
              audioDevices.push(match[1]);
            }
          }
        }

        logger.info('✅ Found', audioDevices.length, 'audio devices');
        resolve(audioDevices);
      });

      listProcess.on('error', (error) => {
        logger.error('❌ Failed to list devices:', error.message);
        resolve([]);
      });
    });
  }

  cleanup() {
    this.stopRecording();
  }
}

export default WindowsAudioService;
