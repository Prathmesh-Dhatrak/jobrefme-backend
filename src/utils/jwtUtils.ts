import jwt from 'jsonwebtoken';
import { IUser } from '../models/userModel';
import { logger } from './logger';

/**
 * Generate a JWT token for a user
 */
export function generateToken(user: IUser): string {
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not defined');
  }
  
  // Create payload with essential user info
  const payload = {
    id: user._id,
    email: user.email
  };
  
  // Sign the token with 15-day expiration
  return jwt.sign(payload, jwtSecret, { expiresIn: '15d' });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): any {
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is not defined');
  }
  
  try {
    return jwt.verify(token, jwtSecret);
  } catch (error) {
    logger.error(`JWT verification error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}