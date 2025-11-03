import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config/config.js';
import logger from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Windows Audio Capture Service using SoX
 * Captures both microphone and system audio using bundled SoX
 */
class WindowsAudioServiceSoX {
  constructor() {
    this.chunkDuration = config.audio.chunkDuration;
    this.isRecording = false;
    this.recordProcess = null;
    this.currentChunkPath = null;
    this.tempDir = config.paths.tempAudio;
    this.chunkCount = 0;
    this.callback = null;
    this.audioDevice = null;
    this.soxPath = this._getSoxPath();
    
    this._ensureTempDirectory();
    this._verifySoxInstallation();
  }

  /**
   * Get the path to SoX executable
   * Checks bundled binaries first, then system PATH
   */
  _getSoxPath() {
    // Check if running in production (electron packaged app)
    if (process.resourcesPath) {
      const bundledSox = path.join(process.resourcesPath, 'binaries', 'sox', 'sox.exe');
      if (fs.existsSync(bundledSox)) {
        return bundledSox;
      }
    }

    // Check local binaries folder (development)
    const localSox = path.join(process.cwd(), 'binaries', 'sox', 'sox.exe');
    if (fs.existsSync(localSox)) {
      return localSox;
    }

    // Fallback to system PATH
    return 'sox';
  }

  /**
   * Get environment variables with SoX directory in PATH
   * This ensures DLL dependencies can be found
   */
  _getEnvWithSoxPath() {
    const env = { ...process.env };
    const soxDir = path.dirname(this.soxPath);
    
    // Add SoX directory to PATH so DLLs can be found
    if (soxDir && soxDir !== '.') {
      env.PATH = `${soxDir}${path.delimiter}${env.PATH || ''}`;
    }
    
    return env;
  }

  /**
   * Verify SoX is available
   */
  async _verifySoxInstallation() {
    return new Promise((resolve) => {
      const soxDir = path.dirname(this.soxPath);
      // When using shell:true, pass command as first arg and empty array as second
      const command = `"${this.soxPath}" --version`;
      const testProcess = spawn(command, [], {
        windowsHide: true,
        shell: true,
        cwd: soxDir !== '.' ? soxDir : undefined,
        env: this._getEnvWithSoxPath()
      });

      let output = '';

      testProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      testProcess.stderr.on('data', (data) => {
        output += data.toString();
      });

      testProcess.on('exit', (code) => {
        if (code === 0 || output.includes('SoX')) {
          logger.info('SoX is available');
          resolve(true);
        } else {
          logger.error('SoX not found or not working');
          logger.error(`Exit code: ${code}`);
          resolve(false);
        }
      });

      testProcess.on('error', (error) => {
        logger.error(`SoX error: ${error.message}`);
        if (error.code === 'ENOENT') {
          logger.error('SoX executable not found');
        }
        resolve(false);
      });
    });
  }

  _ensureTempDirectory() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      logger.info('Created temp audio directory', { path: this.tempDir });
    }
  }

  async startRecording(callback, userSettings = null) {
    if (this.isRecording) {
      logger.warn('Recording already in progress');
      return false;
    }

    logger.info('Starting Windows audio capture');

    // Get device from settings or use default
    const configuredDevice = userSettings?.audio?.device;
    
    if (configuredDevice && configuredDevice !== 'auto') {
      this.audioDevice = configuredDevice;
    } else {
      await this._listAudioDevices();
    }

    this.isRecording = true;
    this.chunkCount = 0;
    this.callback = callback;
    
    logger.info('Recording started');
    
    this._recordChunk();
    return true;
  }

  async _listAudioDevices() {
    return new Promise((resolve) => {
      const soxDir = path.dirname(this.soxPath);
      const command = `"${this.soxPath}" --list-devices`;
      const listProcess = spawn(command, [], {
        windowsHide: true,
        shell: true,
        cwd: soxDir !== '.' ? soxDir : undefined,
        env: this._getEnvWithSoxPath()
      });

      listProcess.on('exit', () => {
        this.audioDevice = 'default';
        logger.info('Using Windows default recording device');
        resolve();
      });

      listProcess.on('error', (error) => {
        logger.error(`Failed to list devices: ${error.message}`);
        this.audioDevice = 'default';
        resolve();
      });
    });
  }

  _recordChunk() {
    if (!this.isRecording) return;

    try {
      this.chunkCount++;
      const timestamp = Date.now();
      this.currentChunkPath = path.join(this.tempDir, `chunk_${timestamp}.wav`);

      const soxDir = path.dirname(this.soxPath);
      const command = `"${this.soxPath}" -t waveaudio -d -r ${config.audio.sampleRate} -c ${config.audio.channels} -b 16 "${this.currentChunkPath}" trim 0 ${this.chunkDuration / 1000}`;

      this.recordProcess = spawn(command, [], {
        windowsHide: true,
        shell: true,
        cwd: soxDir !== '.' ? soxDir : undefined,
        env: this._getEnvWithSoxPath()
      });

      let stderr = '';
      let stdout = '';

      this.recordProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      this.recordProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        const output = data.toString();
        
        if (output.includes('error') || output.includes('Error')) {
          logger.error('SoX error:', output.trim());
        }
      });

      this.recordProcess.on('error', (error) => {
        logger.error('Process error:', error.message);
        
        if (error.code === 'ENOENT') {
          logger.error('SoX not found');
        }
      });

      this.recordProcess.on('exit', (code, signal) => {
        const fileExists = fs.existsSync(this.currentChunkPath);
        
        if (code === 0 && fileExists) {
          const stats = fs.statSync(this.currentChunkPath);

          if (this.callback) {
            this.callback(this.currentChunkPath, stats.size);
          }

          if (this.isRecording) {
            setTimeout(() => this._recordChunk(), 100);
          }
        } else {
          logger.error('Failed to create chunk');
          logger.error(`Exit code: ${code}`);
          
          if (stderr.includes('can\'t open input')) {
            logger.error('No audio input device available');
          }
          
          if (this.isRecording) {
            setTimeout(() => this._recordChunk(), 2000);
          }
        }
      });

    } catch (error) {
      logger.error('Error recording chunk:', { error: error.message });
      if (this.isRecording) {
        setTimeout(() => this._recordChunk(), 2000);
      }
    }
  }

  stopRecording() {
    logger.info('Stopping recording');
    
    this.isRecording = false;

    if (this.recordProcess) {
      try {
        this.recordProcess.kill('SIGTERM');
      } catch (error) {
        logger.error(`Error stopping process: ${error.message}`);
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
      const devices = [
        'Default Recording Device (Configure in Windows Sound Settings)'
      ];
      
      resolve(devices);
    });
  }

  cleanup() {
    this.stopRecording();
  }
}

export default WindowsAudioServiceSoX;
