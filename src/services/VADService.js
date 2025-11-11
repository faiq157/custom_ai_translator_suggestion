import fs from 'fs';
import logger from '../config/logger.js';

class VADService {
  constructor(options = {}) {
    // VAD configuration - OPTIMIZED thresholds to reduce false negatives
    // Lower thresholds = more sensitive (catches more speech, but may include noise)
    // Higher thresholds = less sensitive (fewer false positives, but may miss quiet speech)
    this.energyThreshold = options.energyThreshold || 0.003; // Further lowered from 0.005 to catch quiet speech
    this.minSpeechDuration = options.minSpeechDuration || 200; // Reduced from 300ms to catch shorter utterances
    this.silenceThreshold = options.silenceThreshold || 0.001; // Lowered from 0.003 to be less aggressive
    this.frameSize = options.frameSize || 512; // Frame size for analysis
    
    logger.info('VAD Service initialized', {
      energyThreshold: this.energyThreshold,
      minSpeechDuration: this.minSpeechDuration,
      silenceThreshold: this.silenceThreshold
    });
  }

  /**
   * Quick energy check - fast pre-filter before full VAD
   * @param {string} audioPath - Path to WAV audio file
   * @returns {Promise<Object>} - Quick check result
   */
  async quickCheck(audioPath) {
    try {
      if (!fs.existsSync(audioPath)) {
        return { hasVoice: false, confidence: 0, reason: 'file_not_found' };
      }

      const ext = audioPath.toLowerCase().split('.').pop();
      if (ext !== 'wav') {
        return { hasVoice: true, confidence: 0.5, reason: 'non_wav_format' };
      }

      // Quick check: read first 1KB of audio data
      const audioBuffer = fs.readFileSync(audioPath, { start: 0, end: 1024 });
      
      // Find data chunk quickly
      let dataOffset = -1;
      let offset = 12;
      while (offset < Math.min(audioBuffer.length - 8, 200)) {
        const chunkId = audioBuffer.toString('ascii', offset, offset + 4);
        const chunkSize = audioBuffer.readUInt32LE(offset + 4);
        
        if (chunkId === 'data') {
          dataOffset = offset + 8;
          break;
        }
        offset += 8 + chunkSize;
      }

      if (dataOffset === -1) {
        return { hasVoice: true, confidence: 0.5, reason: 'quick_check_fallback' };
      }

      // Quick energy calculation on first samples
      const sampleCount = Math.min(256, (audioBuffer.length - dataOffset) / 2);
      let sumSquares = 0;
      for (let i = dataOffset; i < dataOffset + (sampleCount * 2) && i < audioBuffer.length - 1; i += 2) {
        const sample = audioBuffer.readInt16LE(i) / 32768.0;
        sumSquares += sample * sample;
      }
      const quickEnergy = Math.sqrt(sumSquares / sampleCount);

      // If energy is clearly above threshold, skip full VAD
      if (quickEnergy > this.energyThreshold * 2) {
        return { hasVoice: true, confidence: 0.8, energy: quickEnergy, reason: 'quick_check_high_energy' };
      }

      // If energy is clearly below threshold, skip full VAD
      if (quickEnergy < this.silenceThreshold) {
        return { hasVoice: false, confidence: 0.2, energy: quickEnergy, reason: 'quick_check_low_energy' };
      }

      // Uncertain - need full VAD
      return { needsFullVAD: true, energy: quickEnergy };
    } catch (error) {
      logger.debug('Quick VAD check error, falling back to full VAD', { error: error.message });
      return { needsFullVAD: true };
    }
  }

  /**
   * Analyze audio file to detect voice activity
   * @param {string} audioPath - Path to WAV audio file
   * @param {boolean} useQuickCheck - Use quick check first (default: true)
   * @returns {Promise<Object>} - VAD analysis result
   */
  async analyzeAudio(audioPath, useQuickCheck = true) {
    try {
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      // Quick check first (if enabled) - can skip full VAD for obvious cases
      if (useQuickCheck) {
        const quickResult = await this.quickCheck(audioPath);
        if (!quickResult.needsFullVAD) {
          logger.debug('VAD: Quick check result', {
            hasVoice: quickResult.hasVoice,
            reason: quickResult.reason,
            energy: quickResult.energy?.toFixed(4)
          });
          return quickResult;
        }
      }

      // Check file extension - only process WAV files
      const ext = audioPath.toLowerCase().split('.').pop();
      if (ext !== 'wav') {
        logger.debug('VAD: Skipping non-WAV file - assuming has voice', { 
          path: audioPath,
          extension: ext 
        });
        // For non-WAV files (like WebM from browser), assume they have voice
        return { 
          hasVoice: true, 
          confidence: 0.5, 
          energy: 0,
          reason: 'non_wav_format' 
        };
      }

      const audioBuffer = fs.readFileSync(audioPath);
      const audioData = this._parseWavFile(audioBuffer);
      
      if (!audioData) {
        logger.warn('Failed to parse WAV file - assuming has voice', { path: audioPath });
        return { hasVoice: true, confidence: 0.5, energy: 0, reason: 'parse_error' };
      }

      const analysis = this._analyzeVoiceActivity(audioData);
      
      logger.debug('VAD analysis complete', {
        path: audioPath,
        hasVoice: analysis.hasVoice,
        confidence: analysis.confidence.toFixed(3),
        energy: analysis.energy.toFixed(3),
        duration: analysis.duration
      });

      return analysis;
    } catch (error) {
      logger.error('VAD analysis error', { 
        error: error.message,
        path: audioPath 
      });
      // On error, assume there might be voice to avoid missing content
      return { hasVoice: true, confidence: 0.5, reason: 'error_fallback' };
    }
  }

  /**
   * Parse WAV file and extract audio samples
   * @param {Buffer} buffer - WAV file buffer
   * @returns {Object|null} - Parsed audio data
   */
  _parseWavFile(buffer) {
    try {
      // Check WAV header
      const riff = buffer.toString('ascii', 0, 4);
      const wave = buffer.toString('ascii', 8, 12);
      
      if (riff !== 'RIFF' || wave !== 'WAVE') {
        logger.warn('Invalid WAV file format');
        return null;
      }

      // Find data chunk
      let offset = 12;
      let dataOffset = -1;
      let dataSize = 0;
      
      while (offset < buffer.length - 8) {
        const chunkId = buffer.toString('ascii', offset, offset + 4);
        const chunkSize = buffer.readUInt32LE(offset + 4);
        
        if (chunkId === 'data') {
          dataOffset = offset + 8;
          dataSize = chunkSize;
          break;
        }
        
        offset += 8 + chunkSize;
      }

      if (dataOffset === -1) {
        logger.warn('No data chunk found in WAV file');
        return null;
      }

      // Extract audio samples (16-bit PCM)
      const samples = [];
      for (let i = dataOffset; i < dataOffset + dataSize && i < buffer.length - 1; i += 2) {
        const sample = buffer.readInt16LE(i);
        samples.push(sample / 32768.0); // Normalize to [-1, 1]
      }

      return {
        samples,
        sampleRate: buffer.readUInt32LE(24), // Sample rate from WAV header
        duration: (samples.length / buffer.readUInt32LE(24)) * 1000 // Duration in ms
      };
    } catch (error) {
      logger.error('Error parsing WAV file', { error: error.message });
      return null;
    }
  }

  /**
   * Analyze voice activity in audio samples
   * @param {Object} audioData - Parsed audio data
   * @returns {Object} - Analysis result
   */
  _analyzeVoiceActivity(audioData) {
    const { samples, duration } = audioData;
    
    if (samples.length === 0) {
      return { 
        hasVoice: false, 
        confidence: 0, 
        energy: 0, 
        duration: 0,
        reason: 'empty_audio' 
      };
    }

    // Calculate overall energy
    const energy = this._calculateEnergy(samples);
    
    // Calculate zero-crossing rate (helps detect speech)
    const zcr = this._calculateZeroCrossingRate(samples);
    
    // Calculate spectral features
    const spectralCentroid = this._calculateSpectralCentroid(samples);
    
    // Voice detection logic
    let hasVoice = false;
    let confidence = 0;
    let reason = '';

    // Check energy threshold
    if (energy > this.energyThreshold) {
      hasVoice = true;
      confidence = Math.min(energy / this.energyThreshold, 1.0);
      reason = 'energy_detected';
    }

    // Additional check: Zero-crossing rate (speech typically has moderate ZCR)
    if (zcr > 0.05 && zcr < 0.3) {
      confidence = Math.min(confidence + 0.2, 1.0);
      reason = reason ? reason + ',zcr_match' : 'zcr_match';
    }

    // Check minimum duration
    if (hasVoice && duration < this.minSpeechDuration) {
      hasVoice = false;
      confidence = 0;
      reason = 'too_short';
    }

    // Detect silence (very low energy) - but be less aggressive
    // Only mark as silence if energy is extremely low AND duration is very short
    if (energy < this.silenceThreshold && duration < 1000) {
      hasVoice = false;
      confidence = 0;
      reason = 'silence_detected';
    }

    return {
      hasVoice,
      confidence: Math.min(confidence, 1.0),
      energy,
      zcr,
      spectralCentroid,
      duration,
      reason: reason || 'no_voice'
    };
  }

  /**
   * Calculate energy of audio signal
   * @param {Array} samples - Audio samples
   * @returns {number} - Energy value
   */
  _calculateEnergy(samples) {
    const sumSquares = samples.reduce((sum, sample) => sum + sample * sample, 0);
    return Math.sqrt(sumSquares / samples.length);
  }

  /**
   * Calculate zero-crossing rate
   * @param {Array} samples - Audio samples
   * @returns {number} - ZCR value
   */
  _calculateZeroCrossingRate(samples) {
    let crossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i] >= 0 && samples[i - 1] < 0) || 
          (samples[i] < 0 && samples[i - 1] >= 0)) {
        crossings++;
      }
    }
    return crossings / samples.length;
  }

  /**
   * Calculate spectral centroid (simplified)
   * @param {Array} samples - Audio samples
   * @returns {number} - Spectral centroid
   */
  _calculateSpectralCentroid(samples) {
    // Simplified spectral centroid calculation
    // In a full implementation, you'd use FFT
    let weightedSum = 0;
    let sum = 0;
    
    for (let i = 0; i < samples.length; i++) {
      const magnitude = Math.abs(samples[i]);
      weightedSum += i * magnitude;
      sum += magnitude;
    }
    
    return sum > 0 ? weightedSum / sum : 0;
  }

  /**
   * Update VAD configuration
   * @param {Object} options - New configuration options
   */
  updateConfig(options) {
    if (options.energyThreshold !== undefined) {
      this.energyThreshold = options.energyThreshold;
    }
    if (options.minSpeechDuration !== undefined) {
      this.minSpeechDuration = options.minSpeechDuration;
    }
    if (options.silenceThreshold !== undefined) {
      this.silenceThreshold = options.silenceThreshold;
    }
    
    logger.info('VAD configuration updated', {
      energyThreshold: this.energyThreshold,
      minSpeechDuration: this.minSpeechDuration,
      silenceThreshold: this.silenceThreshold
    });
  }

  /**
   * Get current VAD statistics
   * @returns {Object} - VAD stats
   */
  getStats() {
    return {
      energyThreshold: this.energyThreshold,
      minSpeechDuration: this.minSpeechDuration,
      silenceThreshold: this.silenceThreshold
    };
  }
}

export default VADService;
