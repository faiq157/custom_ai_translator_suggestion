import OpenAI from 'openai';
import fs from 'fs';
import config from '../config/config.js';
import logger from '../config/logger.js';

class TranscriptionService {
  constructor() {
    this.enabled = config.openai.enabled;
    
    if (this.enabled) {
      this.client = new OpenAI({
        apiKey: config.openai.apiKey
      });
      this.model = config.openai.whisperModel;
    }
    
    this.totalCost = 0;
    this.transcriptionCount = 0;
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
      // WAV header is ~44 bytes, very small files indicate no speech
      if (fileStats.size < 5000) {
        logger.debug('Skipping transcription - file too small (likely silence)', {
          fileSize: `${fileSizeKB}KB`
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

      // Transcribe using Whisper API
      const transcription = await this.client.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: this.model,
        response_format: 'text',
        language: 'en' // Can be made configurable
      });

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

      // Calculate approximate cost (Whisper is $0.006 per minute)
      // Assuming 5-second chunks
      const estimatedCost = (config.audio.chunkDuration / 1000 / 60) * 0.006;
      this.totalCost += estimatedCost;
      this.transcriptionCount++;

      // Don't delete audio file - keep it for playback
      // Files will be cleaned up when recording stops

      if (text) {
        logger.info('Transcription complete', {
          duration: `${duration}ms`,
          textLength: text.length,
          fileSize: `${fileSizeKB}KB`,
          preview: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
          cost: `$${estimatedCost.toFixed(4)}`
        });
      } else {
        logger.debug('Empty transcription result');
      }

      return {
        text,
        duration,
        cost: estimatedCost,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Transcription error', {
        error: error.message,
        file: audioFilePath
      });

      throw error;
    }
  }

  _deleteAudioFile(filePath) {
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
