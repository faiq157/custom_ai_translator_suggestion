/**
 * System Routes
 * System check, installation, and permissions endpoints
 */

import express from 'express';
import { asyncHandler } from '../utils/errorHandler.js';
import { sendJSON, sendError } from '../utils/responseHelper.js';
import { HTTP_STATUS } from '../constants/index.js';
import logger from '../config/logger.js';
import SystemCheckService from '../services/SystemCheckService.js';

const router = express.Router();
const systemCheck = new SystemCheckService();

/**
 * POST /api/system/check
 * Check system dependencies
 */
router.post('/api/system/check', asyncHandler(async (req, res) => {
  const result = await SystemCheckService.checkDependencies();
  sendJSON(res, result);
}));

/**
 * POST /api/system/install/:dependency
 * Install specific dependency
 */
router.post('/api/system/install/:dependency', asyncHandler(async (req, res) => {
  const { dependency } = req.params;
  logger.info('Installing dependency', { dependency });
  
  const result = await systemCheck.installDependency(dependency);
  sendJSON(res, result);
}));

/**
 * POST /api/system/install-all
 * Install all missing dependencies
 */
router.post('/api/system/install-all', asyncHandler(async (req, res) => {
  logger.info('Installing all missing dependencies');
  const result = await systemCheck.installAllMissing();
  sendJSON(res, result);
}));

/**
 * POST /api/system/permissions
 * Request audio permissions
 */
router.post('/api/system/permissions', asyncHandler(async (req, res) => {
  logger.info('Requesting audio permissions');
  const result = await systemCheck.requestAudioPermissions();
  sendJSON(res, result);
}));

export default router;
