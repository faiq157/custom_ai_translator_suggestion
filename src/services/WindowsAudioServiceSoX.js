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
    // First, try development locations (when running with npm run electron)
    // Check multiple possible locations
    const devPaths = [
      // Relative to current working directory
      path.join(process.cwd(), 'binaries', 'sox', 'sox.exe'),
      // Relative to this file's location (go up from src/services/ to project root)
      path.join(__dirname, '..', '..', 'binaries', 'sox', 'sox.exe'),
      // Alternative: relative to __dirname
      path.join(__dirname, '../../binaries/sox/sox.exe'),
    ];
    
    for (const devPath of devPaths) {
      if (fs.existsSync(devPath)) {
        logger.info('Found SoX in development:', devPath);
        return devPath;
      }
    }

    // Check if running in production (electron packaged app)
    // In Windows NSIS installer:
    // - extraFiles puts binaries next to the .exe (installation directory)
    // - extraResources puts binaries in resources folder
    // - process.execPath in spawned Node.js process points to Node.js, not Electron app
    // - process.resourcesPath points to resources folder: "C:\Users\...\Meeting AI Assistant\resources"
    // - APP_INSTALL_DIR env var (set by Electron) points to installation directory
    
    // Get installation directory from environment variable (set by Electron)
    const installDir = process.env.APP_INSTALL_DIR || '';
    const resourcesDir = process.env.APP_RESOURCES_PATH || process.resourcesPath || '';
    
    // Build all possible paths where SoX might be located
    const possiblePaths = [];
    
    // 1. extraFiles location (installation directory, same level as .exe) - HIGHEST PRIORITY
    // Example: C:\Users\Zigron\AppData\Local\Programs\Meeting AI Assistant\binaries\sox\sox.exe
    // This is the actual location based on your file structure
    if (installDir) {
      const soxPath1 = path.normalize(path.join(installDir, 'binaries', 'sox', 'sox.exe'));
      possiblePaths.push(soxPath1);
      logger.info('Checking APP_INSTALL_DIR location:', soxPath1);
    }
    
    // 2. Derive from resourcesPath (resources is inside installation directory)
    // Installation dir is parent of resources: C:\Users\...\Meeting AI Assistant
    if (resourcesDir) {
      const derivedInstallDir = path.dirname(path.normalize(resourcesDir));
      const soxPath2 = path.normalize(path.join(derivedInstallDir, 'binaries', 'sox', 'sox.exe'));
      possiblePaths.push(soxPath2);
      logger.info('Checking derived from resourcesPath:', soxPath2);
    }
    
    // 3. extraResources location (in resources folder)
    // Example: C:\Users\...\Meeting AI Assistant\resources\binaries\sox\sox.exe
    if (resourcesDir) {
      const soxPath3 = path.normalize(path.join(resourcesDir, 'binaries', 'sox', 'sox.exe'));
      possiblePaths.push(soxPath3);
      logger.info('Checking extraResources location:', soxPath3);
    }
    
    // 4. Fallback: try process.execPath (might point to Node.js, but worth checking)
    if (process.execPath) {
      const execDir = path.dirname(path.normalize(process.execPath));
      // Check if execPath looks like it's in the installation directory
      if (execDir.includes('Meeting AI Assistant') || execDir.includes('resources')) {
        const parentDir = execDir.includes('resources') ? path.dirname(execDir) : execDir;
        const soxPath4 = path.normalize(path.join(parentDir, 'binaries', 'sox', 'sox.exe'));
        possiblePaths.push(soxPath4);
        logger.info('Checking derived from execPath:', soxPath4);
      }
    }
    
    // Remove duplicates and null values
    const uniquePaths = [...new Set(possiblePaths.filter(p => p !== null && p !== ''))];
    
    logger.info('Checking SoX paths in production:', {
      APP_INSTALL_DIR: process.env.APP_INSTALL_DIR,
      APP_RESOURCES_PATH: process.env.APP_RESOURCES_PATH,
      resourcesPath: process.resourcesPath,
      execPath: process.execPath,
      cwd: process.cwd(),
      possiblePaths: uniquePaths
    });
    
    // Check each path with detailed logging
    for (const soxPath of uniquePaths) {
      try {
        const normalizedPath = path.normalize(soxPath);
        logger.info(`Checking: ${normalizedPath}`);
        
        if (fs.existsSync(normalizedPath)) {
          logger.info('✓ Found SoX at:', normalizedPath);
          return normalizedPath;
        } else {
          logger.warn('✗ SoX not found at:', normalizedPath);
          // Try to see what's in the parent directory
          const parentDir = path.dirname(normalizedPath);
          if (fs.existsSync(parentDir)) {
            try {
              const files = fs.readdirSync(parentDir);
              logger.info(`  Directory exists, contents: ${files.join(', ')}`);
            } catch (e) {
              logger.debug(`  Could not list directory: ${e.message}`);
            }
          } else {
            logger.warn(`  Parent directory does not exist: ${parentDir}`);
          }
        }
      } catch (error) {
        logger.error('Error checking path:', soxPath, error.message);
      }
    }
    
    logger.error('✗ SoX not found in any production location.');
    logger.error('Tried paths:', uniquePaths);
    logger.error('Please ensure SoX binaries are included in the build.');
    logger.error('Expected location based on your path:');
    logger.error('  C:\\Users\\Zigron\\AppData\\Local\\Programs\\Meeting AI Assistant\\binaries\\sox\\sox.exe');

    // Fallback to system PATH
    logger.warn('SoX not found in bundled locations, falling back to system PATH');
    logger.warn('This will likely fail unless SoX is installed system-wide.');
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
          logger.info('SoX is available', { soxPath: this.soxPath, version: output.trim() });
          resolve(true);
        } else {
          logger.error('SoX not found or not working');
          logger.error(`Exit code: ${code}`);
          logger.error(`SoX path attempted: ${this.soxPath}`);
          logger.error(`Output: ${output}`);
          resolve(false);
        }
      });

      testProcess.on('error', (error) => {
        logger.error(`SoX error: ${error.message}`);
        logger.error(`SoX path attempted: ${this.soxPath}`);
        if (error.code === 'ENOENT') {
          logger.error(`SoX executable not found at: ${this.soxPath}`);
          logger.error('Please ensure SoX binaries are included in the installation');
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

    // Verify SoX is available before starting
    const soxAvailable = await this._verifySoxInstallation();
    if (!soxAvailable) {
      const errorMsg = `SoX audio capture tool not found. Please ensure:\n1. The app is properly installed\n2. SoX binaries are included in the installation\n3. Try reinstalling the application`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

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
    
    logger.info('Recording started', { soxPath: this.soxPath });
    
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
          const errorMsg = `SoX executable not found at: ${this.soxPath}\n\nPlease ensure:\n1. SoX binaries are included in the installation\n2. The app is properly installed\n3. Try reinstalling the application`;
          logger.error(errorMsg);
          
          // Emit error to callback if available
          if (this.callback) {
            try {
              this.callback(null, 0, new Error(errorMsg));
            } catch (e) {
              // Callback might not support error parameter
              logger.error('Failed to notify callback of error:', e.message);
            }
          }
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
          logger.error(`Stderr: ${stderr}`);
          
          if (stderr.includes('can\'t open input') || stderr.includes("can't open input")) {
            const errorMsg = `No audio input device available.\n\nPlease check:\n1. Windows Sound Settings → Recording tab\n2. Ensure a microphone or recording device is enabled\n3. Set a default recording device\n4. Grant microphone permissions to the app in Windows Settings → Privacy → Microphone`;
            logger.error(errorMsg);
            
            // Emit helpful error message
            if (this.callback) {
              try {
                this.callback(null, 0, new Error(errorMsg));
              } catch (e) {
                logger.error('Failed to notify callback of error:', e.message);
              }
            }
          } else if (stderr.includes('error') || stderr.includes('Error')) {
            logger.error(`SoX error: ${stderr}`);
            if (this.callback) {
              try {
                this.callback(null, 0, new Error(`Audio capture error: ${stderr}`));
              } catch (e) {
                logger.error('Failed to notify callback of error:', e.message);
              }
            }
          }
          
          // Retry with delay to avoid rapid error loops
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
