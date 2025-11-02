/**
 * Response Helper Utilities
 * Standardized response formatting for API endpoints
 */

import { HTTP_STATUS } from '../constants/index.js';
import logger from '../config/logger.js';

/**
 * Send success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code
 */
export function sendSuccess(res, data = null, message = 'Success', statusCode = HTTP_STATUS.OK) {
  const response = {
    success: true,
    message,
    ...(data && { data })
  };
  
  res.status(statusCode).json(response);
}

/**
 * Send error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {Error} error - Error object (optional)
 */
export function sendError(res, message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, error = null) {
  const response = {
    success: false,
    error: message
  };
  
  // Log error details
  if (error) {
    logger.error(message, { 
      error: error.message, 
      stack: error.stack 
    });
  } else {
    logger.error(message);
  }
  
  res.status(statusCode).json(response);
}

/**
 * Send file download response
 * @param {Object} res - Express response object
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Download filename
 * @param {string} contentType - MIME type
 */
export function sendFileDownload(res, buffer, filename, contentType = 'application/octet-stream') {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(buffer);
}

/**
 * Send JSON response
 * @param {Object} res - Express response object
 * @param {*} data - JSON data
 * @param {number} statusCode - HTTP status code
 */
export function sendJSON(res, data, statusCode = HTTP_STATUS.OK) {
  res.status(statusCode).json(data);
}
