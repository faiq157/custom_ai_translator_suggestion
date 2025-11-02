/**
 * Export Routes
 * PDF export endpoints for transcripts, suggestions, and complete meetings
 */

import express from 'express';
import { asyncHandler } from '../utils/errorHandler.js';
import { sendFileDownload } from '../utils/responseHelper.js';
import logger from '../config/logger.js';
import PDFExportService from '../services/PDFExportService.js';

const router = express.Router();
const pdfExportService = new PDFExportService();

/**
 * POST /api/export/transcript
 * Generate and download transcript PDF
 */
router.post('/api/export/transcript', asyncHandler(async (req, res) => {
  const { title, date, transcriptions } = req.body;
  
  logger.info('Generating transcript PDF', { 
    transcriptionCount: transcriptions?.length || 0 
  });
  
  const pdfBuffer = await pdfExportService.generateTranscriptPDF({
    title: title || 'Meeting Transcript',
    date: date || new Date().toLocaleString(),
    transcriptions: transcriptions || []
  });
  
  const filename = `transcript_${Date.now()}.pdf`;
  sendFileDownload(res, pdfBuffer, filename, 'application/pdf');
  
  logger.info('Transcript PDF generated successfully');
}));

/**
 * POST /api/export/suggestions
 * Generate and download suggestions PDF
 */
router.post('/api/export/suggestions', asyncHandler(async (req, res) => {
  const { title, date, suggestions } = req.body;
  
  logger.info('Generating suggestions PDF', { 
    suggestionCount: suggestions?.length || 0 
  });
  
  const pdfBuffer = await pdfExportService.generateSuggestionsPDF({
    title: title || 'AI Suggestions',
    date: date || new Date().toLocaleString(),
    suggestions: suggestions || []
  });
  
  const filename = `suggestions_${Date.now()}.pdf`;
  sendFileDownload(res, pdfBuffer, filename, 'application/pdf');
  
  logger.info('Suggestions PDF generated successfully');
}));

/**
 * POST /api/export/complete-meeting
 * Generate and download complete meeting PDF with AI summary
 */
router.post('/api/export/complete-meeting', asyncHandler(async (req, res) => {
  const { title, date, transcriptions, suggestions } = req.body;
  
  logger.info('Generating complete meeting PDF with AI summary', { 
    transcriptionCount: transcriptions?.length || 0,
    suggestionCount: suggestions?.length || 0
  });
  
  const pdfBuffer = await pdfExportService.generateCompleteMeetingPDF({
    title: title || 'Meeting Summary Report',
    date: date || new Date().toLocaleString(),
    transcriptions: transcriptions || [],
    suggestions: suggestions || []
  });
  
  const filename = `meeting_summary_${Date.now()}.pdf`;
  sendFileDownload(res, pdfBuffer, filename, 'application/pdf');
  
  logger.info('Complete meeting PDF generated successfully');
}));

export default router;
