/**
 * Security Middleware
 * Security-related middleware configuration
 */

import helmet from 'helmet';
import cors from 'cors';

/**
 * Configure Helmet security headers
 */
export function configureHelmet() {
  return helmet({
    contentSecurityPolicy: false // Allow inline scripts for development
  });
}

/**
 * Configure CORS
 */
export function configureCORS() {
  return cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });
}
