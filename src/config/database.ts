import mongoose from 'mongoose';
import { logger } from '../utils/logger';

/**
 * Connect to MongoDB Atlas database
 */
export async function connectToDatabase(): Promise<void> {
  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI environment variable is not defined');
    }

    await mongoose.connect(mongoURI);
    
    logger.info('Connected to MongoDB Atlas successfully');
    
    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err}`);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    
    process.on('SIGINT', async () => {
      try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed due to app termination');
        process.exit(0);
      } catch (err) {
        logger.error(`Error closing MongoDB connection: ${err}`);
        process.exit(1);
      }
    });
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}