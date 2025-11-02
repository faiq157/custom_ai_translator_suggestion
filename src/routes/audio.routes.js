/**
 * Audio Routes
 * Audio device management endpoints
 */

import express from 'express';
import { asyncHandler } from '../utils/errorHandler.js';
import { sendJSON } from '../utils/responseHelper.js';
import logger from '../config/logger.js';
import config from '../config/config.js';
import AudioDeviceService from '../services/AudioDeviceService.js';

const router = express.Router();
const audioDeviceService = new AudioDeviceService();

/**
 * GET /api/audio/devices
 * List available audio devices
 */
router.get('/api/audio/devices', asyncHandler(async (req, res) => {
  const devices = await audioDeviceService.listAudioDevices();
  sendJSON(res, devices);
}));

/**
 * POST /api/audio/device
 * Set active audio device
 */
router.post('/api/audio/device', asyncHandler(async (req, res) => {
  const { deviceId } = req.body;
  const result = await audioDeviceService.setAudioDevice(deviceId);
  
  // Update config
  config.audio.device = deviceId;
  
  logger.info('Audio device updated', { deviceId });
  sendJSON(res, result);
}));

export default router;
