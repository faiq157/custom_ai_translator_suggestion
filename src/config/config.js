import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Get writable base directory
const getDataDir = () => {
  if (process.env.NODE_ENV === 'production') {
    // Use user home directory for production builds
    return path.join(os.homedir(), '.meeting-ai-assistant');
  }
  // Use project directory for development
  return path.join(__dirname, '../..');
};

// Get public directory (read-only, from app resources)
const getPublicDir = () => {
  if (process.env.NODE_ENV === 'production') {
    // In production, public folder is in app.asar.unpacked
    // __dirname will be something like: /tmp/.mount_xxx/resources/app.asar.unpacked/src/config
    return path.join(__dirname, '../../public');
  }
  // In development
  return path.join(__dirname, '../../public');
};

const dataDir = getDataDir();
const publicDir = getPublicDir();

// Debug logging for paths
if (process.env.NODE_ENV === 'production') {
  console.log('Production paths:', {
    dataDir,
    publicDir,
    __dirname
  });
}

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
    tempAudio: path.join(dataDir, 'temp_audio'),
    logs: path.join(dataDir, 'logs'),
    meetings: path.join(dataDir, 'meetings'),
    exports: path.join(dataDir, 'exports'),
    public: publicDir
  }
};

export default config;
