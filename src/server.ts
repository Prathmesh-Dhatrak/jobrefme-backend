import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { logger } from './utils/logger';
import { connectToDatabase } from './config/database';

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectToDatabase()
  .then(() => {
    logger.info(`JobRefMe Backend (HireJobs.in Support)`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);
    logger.info(`GEMINI_API_KEY is ${process.env.GEMINI_API_KEY ? 'set' : 'not set'}`);
    logger.info(`MongoDB is connected`);
    logger.info(`Google OAuth is ${process.env.GOOGLE_CLIENT_ID ? 'configured' : 'not configured'}`);

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Referral generator service is ready!`);
    });
  })
  .catch((error) => {
    logger.error(`Database connection failed: ${error.message}`);
    process.exit(1);
  });

process.on('unhandledRejection', (error: Error) => {
  logger.error('Unhandled rejection', error);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});