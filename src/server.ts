import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 3000;

logger.info(`Environment: ${process.env.NODE_ENV}`);
logger.info(`Using mock crawler: ${process.env.MOCK_CRAWLER === 'true'}`);
logger.info(`Using mock AI: ${process.env.MOCK_AI === 'true'}`);
logger.info(`GEMINI_API_KEY is ${process.env.GEMINI_API_KEY ? 'set' : 'not set'}`);

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

process.on('unhandledRejection', (error: Error) => {
  logger.error('Unhandled rejection', error);
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', error);
  process.exit(1);
});