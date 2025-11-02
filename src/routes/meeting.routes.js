/**
 * Meeting Routes
 * Endpoints for meeting history and management
 */

import express from 'express';
import path from 'path';
import { asyncHandler, NotFoundError } from '../utils/errorHandler.js';
import { sendJSON, sendError } from '../utils/responseHelper.js';
import { HTTP_STATUS } from '../constants/index.js';
import logger from '../config/logger.js';
import MeetingHistoryService from '../services/MeetingHistoryService.js';

const router = express.Router();
const meetingHistoryService = new MeetingHistoryService();

/**
 * GET /api/meetings
 * List all meetings
 */
router.get('/api/meetings', asyncHandler(async (req, res) => {
  const meetings = meetingHistoryService.listMeetings();
  sendJSON(res, { meetings });
}));

/**
 * GET /api/meetings/:id
 * Get specific meeting details
 */
router.get('/api/meetings/:id', asyncHandler(async (req, res) => {
  const meeting = meetingHistoryService.getMeeting(req.params.id);
  
  if (!meeting) {
    throw new NotFoundError('Meeting');
  }
  
  sendJSON(res, meeting);
}));

/**
 * GET /api/meetings/:id/pdf
 * Download meeting PDF
 */
router.get('/api/meetings/:id/pdf', asyncHandler(async (req, res) => {
  const pdfPath = path.join(process.cwd(), 'meetings', `meeting_${req.params.id}.pdf`);
  
  res.download(pdfPath, `meeting_${req.params.id}.pdf`, (err) => {
    if (err) {
      logger.error('Error downloading PDF', { error: err.message });
      sendError(res, 'PDF not found', HTTP_STATUS.NOT_FOUND);
    }
  });
}));

export default router;
