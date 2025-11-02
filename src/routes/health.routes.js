/**
 * Health Check Routes
 * System health and information endpoints
 */

import express from 'express';
import config from '../config/config.js';
import { sendJSON } from '../utils/responseHelper.js';

const router = express.Router();

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  sendJSON(res, {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv
  });
});

/**
 * GET /api/info
 * API information endpoint
 */
router.get('/api/info', (req, res) => {
  sendJSON(res, {
    name: 'Meeting AI Assistant',
    version: '1.0.0',
    description: 'Real-time AI-powered meeting suggestion system',
    features: [
      'Real-time audio transcription',
      'AI-powered suggestions',
      'WebSocket communication',
      'Cost tracking',
      'Meeting history',
      'PDF export'
    ]
  });
});

export default router;
