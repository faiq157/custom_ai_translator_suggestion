import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SettingsManager {
  constructor() {
    // Store settings in user data directory
    this.userDataPath = app.getPath('userData');
    this.settingsPath = path.join(this.userDataPath, 'settings.json');
    this.settings = this.loadSettings();
  }

  // Default settings
  getDefaultSettings() {
    return {
      openai: {
        apiKey: '',
        model: 'gpt-3.5-turbo',
        whisperModel: 'whisper-1',
        temperature: 0.7,
        maxTokens: 1000
      },
      audio: {
        sampleRate: 16000,
        channels: 1,
        device: 'auto', // 'auto' or specific device name
        autoStart: false,
        captureMode: 'microphone', // 'microphone' or 'system'
        vad: {
          enabled: true,
          energyThreshold: 0.02,
          minSpeechDuration: 300
        }
      },
      ui: {
        theme: 'dark',
        language: 'en',
        notifications: true
      },
      server: {
        port: 3000,
        autoStartServer: true
      },
      firstRun: true
    };
  }

  // Load settings from file
  loadSettings() {
    try {
      // Create user data directory if it doesn't exist
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }

      // Load existing settings or create default
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf8');
        const savedSettings = JSON.parse(data);
        // Merge with defaults to ensure all keys exist
        return { ...this.getDefaultSettings(), ...savedSettings };
      } else {
        const defaults = this.getDefaultSettings();
        this.saveSettings(defaults);
        return defaults;
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      return this.getDefaultSettings();
    }
  }

  // Save settings to file
  saveSettings(settings) {
    try {
      fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      this.settings = settings;
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  }

  // Get all settings
  getSettings() {
    return { ...this.settings };
  }

  // Get specific setting
  getSetting(key) {
    const keys = key.split('.');
    let value = this.settings;
    for (const k of keys) {
      value = value?.[k];
    }
    return value;
  }

  // Update specific setting
  updateSetting(key, value) {
    const keys = key.split('.');
    const settings = { ...this.settings };
    let current = settings;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    return this.saveSettings(settings);
  }

  // Update multiple settings
  updateSettings(updates) {
    const settings = { ...this.settings, ...updates };
    return this.saveSettings(settings);
  }

  // Check if API key is configured
  isConfigured() {
    return this.settings.openai.apiKey && this.settings.openai.apiKey.length > 0;
  }

  // Mark first run as complete
  completeFirstRun() {
    return this.updateSetting('firstRun', false);
  }

  // Reset to defaults
  resetSettings() {
    return this.saveSettings(this.getDefaultSettings());
  }

  // Export settings (without sensitive data)
  exportSettings() {
    const settings = { ...this.settings };
    // Remove API key for security
    if (settings.openai) {
      settings.openai.apiKey = '***HIDDEN***';
    }
    return settings;
  }

  // Get settings file path
  getSettingsPath() {
    return this.settingsPath;
  }
}

export default SettingsManager;
