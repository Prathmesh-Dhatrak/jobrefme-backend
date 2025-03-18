import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { logger } from './utils/logger';
import { connectDB } from './config/database';

const PORT = process.env.PORT || 3000;

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Log configuration
    logger.info(`JobRefMe Backend (HireJobs.in Support)`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    logger.info(`Using mock crawler: ${process.env.MOCK_CRAWLER === 'true'}`);
    logger.info(`Using mock AI: ${process.env.MOCK_AI === 'true'}`);
    logger.info(`GEMINI_API_KEY is ${process.env.GEMINI_API_KEY ? 'set' : 'not set'}`);
    logger.info(`MONGODB_URI is ${process.env.MONGODB_URI ? 'set' : 'not set'}`);
    logger.info(`GOOGLE_CLIENT_ID is ${process.env.GOOGLE_CLIENT_ID ? 'set' : 'not set'}`);
    
    // Start Express server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Referral generator service is ready!`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (error: Error) => {
  logger.error('Unhandled rejection', error);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});