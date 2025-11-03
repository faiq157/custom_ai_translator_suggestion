import express from 'express';
import logger from '../config/logger.js';
import WindowsAudioService from '../services/WindowsAudioService.js';

const router = express.Router();

/**
 * GET /api/devices/audio
 * Get list of available audio devices (Windows only)
 */
router.get('/audio', async (req, res) => {
  try {
    const isWindows = process.platform === 'win32';
    
    if (!isWindows) {
      return res.json({
        success: true,
        devices: ['default'],
        message: 'Device selection only available on Windows'
      });
    }

    logger.info('Fetching available audio devices...');
    
    const audioService = new WindowsAudioService();
    const devices = await audioService.getAvailableDevices();
    
    res.json({
      success: true,
      devices: ['auto', ...devices],
      platform: process.platform
    });
  } catch (error) {
    logger.error('Error fetching audio devices:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
