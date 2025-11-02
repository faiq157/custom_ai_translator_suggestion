/**
 * Routes Index
 * Central router configuration
 */

import healthRoutes from './health.routes.js';
import meetingRoutes from './meeting.routes.js';
import systemRoutes from './system.routes.js';
import audioRoutes from './audio.routes.js';
import exportRoutes from './export.routes.js';

/**
 * Configure all application routes
 * @param {Express} app - Express application instance
 */
export function configureRoutes(app) {
  // Health and info routes
  app.use(healthRoutes);
  
  // Meeting management routes
  app.use(meetingRoutes);
  
  // System check and installation routes
  app.use(systemRoutes);
  
  // Audio device routes
  app.use(audioRoutes);
  
  // PDF export routes
  app.use(exportRoutes);
}

export default {
  configureRoutes
};
