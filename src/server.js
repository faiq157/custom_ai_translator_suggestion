/**
 * Meeting AI Assistant Server
 * Main server configuration and initialization
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import compression from 'compression';
import config from './config/config.js';
import logger from './config/logger.js';
import SocketHandler from './websocket/socketHandler.js';
import { configureRoutes } from './routes/index.js';
import { configureHelmet, configureCORS } from './middleware/security.middleware.js';
import { configureStaticFiles, configureFloatingWindow } from './middleware/static.middleware.js';
import { globalErrorHandler, handleUnhandledRejection, handleUncaughtException } from './utils/errorHandler.js';
import { TIMEOUTS } from './constants/index.js';

// Initialize Express app and HTTP server
const app = express();
const httpServer = createServer(app);

// Initialize Socket.io with CORS
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ==================== MIDDLEWARE CONFIGURATION ====================

// Security middleware
app.use(configureHelmet());
app.use(configureCORS());

// Body parsing middleware
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files and special routes
configureStaticFiles(app);
configureFloatingWindow(app);

// ==================== API ROUTES ====================

// Configure all application routes
configureRoutes(app);

// ==================== WEBSOCKET HANDLER ====================

// Initialize WebSocket handler
const socketHandler = new SocketHandler(io);

// ==================== ERROR HANDLING ====================

// Global error handler
app.use(globalErrorHandler);

// Handle unhandled rejections and exceptions
handleUnhandledRejection();
handleUncaughtException();

// ==================== GRACEFUL SHUTDOWN ====================

/**
 * Graceful shutdown handler
 * Cleans up resources and closes server properly
 */
const gracefulShutdown = () => {
  logger.info('Received shutdown signal, closing server gracefully...');
  
  // Cleanup WebSocket connections
  socketHandler.cleanup();
  
  // Close HTTP server
  httpServer.close(() => {
    logger.info('Server closed successfully');
    process.exit(0);
  });

  // Force close after timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, TIMEOUTS.GRACEFUL_SHUTDOWN);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ==================== SERVER STARTUP ====================

/**
 * Start the HTTP server with automatic port fallback
 */
function startServer(port) {
  httpServer.listen(port, () => {
    logger.info('Server started', {
      port: port,
      environment: config.nodeEnv,
      nodeVersion: process.version,
      url: `http://localhost:${port}`
    });
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = port + 1;
      logger.warn(`Port ${port} is busy, trying port ${nextPort}...`);
      startServer(nextPort);
    } else {
      logger.error('Server error:', err);
      process.exit(1);
    }
  });
}

startServer(config.port);

export default app;
