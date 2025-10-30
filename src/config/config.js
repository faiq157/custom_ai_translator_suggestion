import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Check if OpenAI API key is provided (optional for audio testing)
const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
if (!hasOpenAIKey) {
  console.warn('⚠️  OPENAI_API_KEY not set - Running in AUDIO TEST MODE (no transcription/AI)');
}

const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY || null,
    enabled: hasOpenAIKey,
    whisperModel: process.env.WHISPER_MODEL || 'whisper-1',
    gptModel: process.env.GPT_MODEL || 'gpt-4o-mini',
    maxContextLength: parseInt(process.env.MAX_CONTEXT_LENGTH || '10', 10)
  },
  
  // Audio
  audio: {
    chunkDuration: parseInt(process.env.AUDIO_CHUNK_DURATION || '5000', 10),
    sampleRate: parseInt(process.env.AUDIO_SAMPLE_RATE || '16000', 10),
    channels: 1,
    format: 'wav',
    device: process.env.AUDIO_DEVICE || 'default'
  },
  
  // Paths
  paths: {
    tempAudio: path.join(__dirname, '../../temp_audio'),
    logs: path.join(__dirname, '../../logs'),
    public: path.join(__dirname, '../../public')
  }
};

export default config;
