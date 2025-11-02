/**
 * Static Files Middleware
 * Configuration for serving static files and special routes
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import config from '../config/config.js';
import logger from '../config/logger.js';

/**
 * Configure static file serving
 * @param {Express} app - Express application instance
 */
export function configureStaticFiles(app) {
  // Serve main public directory
  app.use(express.static(config.paths.public));
  
  // Serve audio files with proper headers
  app.use('/audio', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'audio/wav');
    next();
  }, express.static(config.paths.tempAudio));
}

/**
 * Configure floating window route
 * @param {Express} app - Express application instance
 */
export function configureFloatingWindow(app) {
  app.get('/floating', (req, res) => {
    const floatingPath = path.join(config.paths.public, 'floating.html');
    
    logger.info('Floating window requested', { path: floatingPath });
    
    if (!fs.existsSync(floatingPath)) {
      logger.error('floating.html not found', { path: floatingPath });
      return res.status(404).send('Floating window not found');
    }
    
    try {
      const content = fs.readFileSync(floatingPath, 'utf8');
      res.type('html').send(content);
      logger.info('Floating window HTML sent successfully');
    } catch (error) {
      logger.error('Error reading floating.html', { error: error.message });
      res.status(500).send('Error loading floating window');
    }
  });
}
