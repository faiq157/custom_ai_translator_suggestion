import OpenAI from 'openai';
import fs from 'fs';
import config from '../config/config.js';
import logger from '../config/logger.js';

class TranscriptionService {
  constructor() {
    this.enabled = config.openai.enabled;
    
    if (this.enabled) {
      this.client = new OpenAI({
        apiKey: config.openai.apiKey,
        timeout: 30000, // 30 second timeout
        maxRetries: 3 // Retry failed requests
      });
      this.model = config.openai.whisperModel || 'whisper-1';
    }
    
    this.totalCost = 0;
    this.transcriptionCount = 0;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000; // Start with 1 second delay
  }

  async transcribeAudio(audioFilePath) {
    const startTime = Date.now();
    
    try {
      logger.debug('Starting transcription', { file: audioFilePath });
      
      // Check if file exists
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      const fileStats = fs.statSync(audioFilePath);
      const fileSizeKB = (fileStats.size / 1024).toFixed(2);
      
      // Check for silence - if file is too small, it's likely silence
      // WAV header is ~44 bytes, but we need at least some audio data
      // Reduced threshold to catch more valid audio (was 5000, now 2000)
      // For 5-second chunks at 16kHz mono 16-bit: ~160KB expected
      const minFileSize = 2000; // 2KB minimum (was 5KB)
      if (fileStats.size < minFileSize) {
        logger.debug('Skipping transcription - file too small (likely silence)', {
          fileSize: `${fileSizeKB}KB`,
          threshold: `${minFileSize} bytes`
        });
        return {
          text: '',
          duration: Date.now() - startTime,
          cost: 0,
          timestamp: new Date().toISOString(),
          isSilence: true
        };
      }

      // TEST MODE: Skip actual transcription if API key not provided
      if (!this.enabled) {
        const duration = Date.now() - startTime;
        const mockText = `[TEST MODE] Audio captured: ${fileSizeKB}KB at ${new Date().toLocaleTimeString()}`;
        
        logger.info('Audio captured (test mode)', {
          duration: `${duration}ms`,
          fileSize: `${fileSizeKB}KB`
        });

        // Don't delete audio file - keep it for playback
        // Files will be cleaned up when recording stops

        return {
          text: mockText,
          duration,
          cost: 0,
          timestamp: new Date().toISOString()
        };
      }

      // Transcribe using Whisper API with improved parameters
      // Note: OpenAI API currently only supports 'whisper-1' model
      // But we can optimize with better parameters:
      // - temperature: Lower (0.0-0.3) for more deterministic, higher (0.4-1.0) for more creative
      // - prompt: Optional context to improve accuracy
      // - response_format: 'text', 'json', 'verbose_json', etc.
      const transcription = await this._transcribeWithRetry(audioFilePath);

      const duration = Date.now() - startTime;
      const text = transcription.trim();
      
      // Common Whisper hallucinations during silence
      const commonHallucinations = [
        'thank you',
        'thanks for watching',
        'thank you for watching',
        'you',
        'bye',
        'goodbye',
        'thanks',
        'thank you.',
        'thanks for watching!',
        'thank you for watching!',
        'you.',
        'bye.',
        'goodbye.',
        'thanks.',
        'music',
        '[music]',
        '(music)',
        'applause',
        '[applause]',
        '(applause)'
      ];
      
      // Check if transcription is empty, too short, or a common hallucination
      const lowerText = text.toLowerCase();
      const isHallucination = commonHallucinations.some(phrase => 
        lowerText === phrase || lowerText === phrase + '.'
      );
      
      if (!text || text.length < 3 || isHallucination) {
        logger.debug('Empty or hallucinated transcription - likely silence', {
          text: text,
          isHallucination
        });
        return {
          text: '',
          duration,
          cost: 0,
          timestamp: new Date().toISOString(),
          isSilence: true
        };
      }

      // Calculate cost based on actual audio duration (Whisper is $0.006 per minute)
      // Estimate duration from file size: fileSize / (sampleRate * channels * bytesPerSample)
      // For 16kHz mono 16-bit: ~32KB per second
      const estimatedDurationSeconds = fileStats.size / (config.audio.sampleRate * config.audio.channels * 2);
      const estimatedCost = (estimatedDurationSeconds / 60) * 0.006;
      this.totalCost += estimatedCost;
      this.transcriptionCount++;

      // Cleanup audio file if configured
      if (config.audio.cleanup.deleteAfterTranscription && !config.audio.cleanup.keepForPlayback) {
        // Delete after successful transcription to save disk space
        this.deleteAudioFile(audioFilePath);
      }

      if (text) {
        logger.info('Transcription complete', {
          duration: `${duration}ms`,
          textLength: text.length,
          fileSize: `${fileSizeKB}KB`,
          estimatedAudioDuration: `${estimatedDurationSeconds.toFixed(2)}s`,
          preview: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
          cost: `$${estimatedCost.toFixed(6)}`
        });
      } else {
        logger.debug('Empty transcription result');
      }

      return {
        text,
        duration,
        cost: estimatedCost,
        timestamp: new Date().toISOString(),
        audioDuration: estimatedDurationSeconds
      };

    } catch (error) {
      logger.error('Transcription error', {
        error: error.message,
        file: audioFilePath
      });

      throw error;
    }
  }

  /**
   * Transcribe audio with retry logic and exponential backoff
   * @private
   */
  async _transcribeWithRetry(audioFilePath, attempt = 1) {
    try {
      const transcription = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: this.model,
        response_format: 'text',
        language: 'en', // Can be made configurable
        temperature: 0.0, // More deterministic, less hallucinations
        // Optional: Add prompt for better context
        // prompt: 'This is a meeting transcription. Focus on accuracy.'
      });
      
      // Reset retry count on success
      this.retryCount = 0;
      this.retryDelay = 1000;
      
      return transcription;
    } catch (error) {
      // Check if we should retry
      if (attempt < this.maxRetries && this._shouldRetry(error)) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        this.retryCount++;
        
        logger.warn(`Transcription failed, retrying (attempt ${attempt}/${this.maxRetries})`, {
          error: error.message,
          delay: `${delay}ms`,
          file: audioFilePath
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._transcribeWithRetry(audioFilePath, attempt + 1);
      }
      
      // Max retries reached or non-retryable error
      logger.error('Transcription failed after retries', {
        error: error.message,
        attempts: attempt,
        file: audioFilePath
      });
      
      throw error;
    }
  }

  /**
   * Determine if error is retryable
   * @private
   */
  _shouldRetry(error) {
    // Retry on network errors, rate limits, and server errors
    if (error.status === 429 || error.status >= 500) {
      return true;
    }
    
    // Retry on network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return true;
    }
    
    // Don't retry on client errors (4xx except 429)
    return false;
  }

  deleteAudioFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug('Deleted audio file', { file: filePath });
      }
    } catch (err) {
      logger.error('Error deleting audio file', {
        file: filePath,
        error: err.message
      });
    }
  }

  getStats() {
    return {
      transcriptionCount: this.transcriptionCount,
      totalCost: this.totalCost,
      averageCost: this.transcriptionCount > 0 
        ? this.totalCost / this.transcriptionCount 
        : 0
    };
  }

  resetStats() {
    this.totalCost = 0;
    this.transcriptionCount = 0;
    logger.info('Stats reset');
  }
}

export default TranscriptionService;
