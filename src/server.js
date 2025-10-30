import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/config.js';
import logger from './config/logger.js';
import SocketHandler from './websocket/socketHandler.js';
import AudioDeviceService from './services/AudioDeviceService.js';
import SystemCheckService from './services/SystemCheckService.js';
import MeetingHistoryService from './services/MeetingHistoryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const httpServer = createServer(app);

// Initialize Socket.io with CORS
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts for development
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(config.paths.public));

// Serve audio files for playback with proper headers
app.use('/audio', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'audio/wav');
  next();
}, express.static(config.paths.tempAudio));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv
  });
});

// API info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    name: 'Meeting AI Assistant',
    version: '1.0.0',
    description: 'Real-time AI-powered meeting suggestion system',
    features: [
      'Real-time audio transcription',
      'AI-powered suggestions',
      'WebSocket communication',
      'Cost tracking'
    ]
  });
});

// System check endpoints
const systemCheck = new SystemCheckService();
const audioDeviceService = new AudioDeviceService();
const meetingHistoryService = new MeetingHistoryService();

app.post('/api/system/check', async (req, res) => {
  try {
    const result = await SystemCheckService.checkDependencies();
    res.json(result);
  } catch (error) {
    logger.error('System check error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/meetings', (req, res) => {
  try {
    const meetings = meetingHistoryService.listMeetings();
    res.json({ meetings });
  } catch (error) {
    logger.error('Error listing meetings', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/meetings/:id', (req, res) => {
  try {
    const meeting = meetingHistoryService.getMeeting(req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    res.json(meeting);
  } catch (error) {
    logger.error('Error getting meeting', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/meetings/:id/pdf', (req, res) => {
  try {
    const pdfPath = path.join(process.cwd(), 'meetings', `meeting_${req.params.id}.pdf`);
    res.download(pdfPath, `meeting_${req.params.id}.pdf`, (err) => {
      if (err) {
        logger.error('Error downloading PDF', { error: err.message });
        res.status(404).json({ error: 'PDF not found' });
      }
    });
  } catch (error) {
    logger.error('Error downloading PDF', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/system/install/:dependency', async (req, res) => {
  try {
    const { dependency } = req.params;
    logger.info('Installing dependency', { dependency });
    
    const result = await systemCheck.installDependency(dependency);
    res.json(result);
  } catch (error) {
    logger.error('Installation error', { error: error.message });
    res.status(500).json({ error: error.message, success: false });
  }
});

app.post('/api/system/install-all', async (req, res) => {
  try {
    logger.info('Installing all missing dependencies');
    const result = await systemCheck.installAllMissing();
    res.json(result);
  } catch (error) {
    logger.error('Installation error', { error: error.message });
    res.status(500).json({ error: error.message, success: false });
  }
});

app.post('/api/system/permissions', async (req, res) => {
  try {
    logger.info('Requesting audio permissions');
    const result = await systemCheck.requestAudioPermissions();
    res.json(result);
  } catch (error) {
    logger.error('Permission error', { error: error.message });
    res.status(500).json({ error: error.message, success: false });
  }
});

// Audio device endpoints
app.get('/api/audio/devices', async (req, res) => {
  try {
    const devices = await audioDeviceService.listAudioDevices();
    res.json(devices);
  } catch (error) {
    logger.error('Error listing audio devices', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/audio/device', async (req, res) => {
  try {
    const { deviceId } = req.body;
    const result = await audioDeviceService.setAudioDevice(deviceId);
    
    // Update config
    config.audio.device = deviceId;
    
    res.json(result);
  } catch (error) {
    logger.error('Error setting audio device', { error: error.message });
    res.status(500).json({ error: error.message, success: false });
  }
});

// Initialize WebSocket handler
const socketHandler = new SocketHandler(io);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Express error', { error: err.message, stack: err.stack });
  res.status(500).json({
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined
  });
});

// Graceful shutdown
const gracefulShutdown = () => {
  logger.info('Received shutdown signal, closing server gracefully...');
  
  socketHandler.cleanup();
  
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
httpServer.listen(config.port, () => {
  logger.info('🚀 Server started', {
    port: config.port,
    environment: config.nodeEnv,
    nodeVersion: process.version
  });
  logger.info(`📱 Open http://localhost:${config.port} in your browser`);
});

export default app;
