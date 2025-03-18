import mongoose from 'mongoose';
import { logger } from '../utils/logger';

/**
 * Connect to MongoDB Atlas
 */
export const connectDB = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    logger.error('MongoDB URI is not defined in environment variables');
    throw new Error('MongoDB URI is required');
  }

  try {
    await mongoose.connect(mongoUri);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`MongoDB connection error: ${errorMessage}`);
    
    // Exit process with failure
    process.exit(1);
  }
};

/**
 * Disconnect from MongoDB
 */
export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`MongoDB disconnection error: ${errorMessage}`);
  }
};

// Handle connection events
mongoose.connection.on('connected', () => {
  logger.info('MongoDB connection established');
});

mongoose.connection.on('error', (err) => {
  logger.error(`MongoDB connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  logger.info('MongoDB connection disconnected');
});

// Handle application termination
process.on('SIGINT', async () => {
  await disconnectDB();
  process.exit(0);
});