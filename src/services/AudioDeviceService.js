import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../config/logger.js';

const execAsync = promisify(exec);

class AudioDeviceService {
  constructor() {
    this.cachedDevices = null;
    this.cacheTime = null;
    this.cacheTimeout = 30000; // 30 seconds
  }

  async listAudioDevices() {
    // Return cached devices if recent
    if (this.cachedDevices && this.cacheTime && (Date.now() - this.cacheTime < this.cacheTimeout)) {
      return this.cachedDevices;
    }

    const devices = {
      sources: [],
      platform: process.platform,
      recommended: null
    };

    try {
      // Try PulseAudio (Linux)
      const { stdout } = await execAsync('pactl list sources short');
      const sources = stdout.trim().split('\n');

      sources.forEach((source) => {
        const parts = source.split('\t');
        const name = parts[1];
        const description = parts[3] || '';
        
        const isMonitor = name.includes('monitor');
        const isMicrophone = name.includes('input') || name.includes('Mic');
        
        const device = {
          id: name,
          name: this._formatDeviceName(name),
          description: description,
          type: isMonitor ? 'system_audio' : 'microphone',
          recommended: isMonitor && name.includes('Speaker')
        };

        devices.sources.push(device);

        // Set recommended device (Speaker monitor for capturing all audio)
        if (device.recommended) {
          devices.recommended = device.id;
        }
      });

      logger.info('Audio devices listed', { count: devices.sources.length });

    } catch (error) {
      logger.warn('Could not list PulseAudio devices', { error: error.message });
      
      // Fallback: provide default options
      devices.sources = [
        {
          id: 'default',
          name: 'Default Microphone',
          description: 'System default microphone',
          type: 'microphone',
          recommended: false
        }
      ];
    }

    // Cache the results
    this.cachedDevices = devices;
    this.cacheTime = Date.now();

    return devices;
  }

  _formatDeviceName(deviceId) {
    // Convert device ID to human-readable name
    if (deviceId.includes('Speaker') && deviceId.includes('monitor')) {
      return '🔊 System Audio (Captures ALL meeting participants)';
    } else if (deviceId.includes('HDMI') && deviceId.includes('monitor')) {
      return '🖥️ HDMI Audio Monitor';
    } else if (deviceId.includes('Mic')) {
      return '🎤 Microphone (Your voice only)';
    } else if (deviceId.includes('input')) {
      return '🎤 Audio Input';
    } else if (deviceId.includes('monitor')) {
      return '🔊 Audio Monitor';
    } else if (deviceId === 'default') {
      return '🎤 Default Microphone';
    }
    
    return deviceId;
  }

  async setAudioDevice(deviceId) {
    logger.info('Setting audio device', { deviceId });
    
    // Validate device exists
    const devices = await this.listAudioDevices();
    const device = devices.sources.find(d => d.id === deviceId);
    
    if (!device) {
      throw new Error(`Audio device not found: ${deviceId}`);
    }

    return {
      success: true,
      device: device,
      message: `Audio source set to: ${device.name}`
    };
  }
}

export default AudioDeviceService;
