import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwtUtils';
import User from '../models/userModel';
import { ApiError } from '../utils/errorHandler';
import { logger } from '../utils/logger';

/**
 * We don't need to declare the global namespace here, as it conflicts
 * with the existing Express definitions. Instead, we'll use type casting
 * where needed.
 */

/**
 * Middleware to protect routes requiring authentication
 */
export async function protect(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    let token;
    
    // Get token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } 
    // Get token from cookie (fallback for browser extensions)
    else if (req.cookies?.token) {
      token = req.cookies.token;
    }
    
    // Check if token exists
    if (!token) {
      next(new ApiError(401, 'Not authorized, no token'));
      return;
    }
    
    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      next(new ApiError(401, 'Not authorized, token failed'));
      return;
    }
    
    // Find user from token
    const user = await User.findById(decoded.id);
    if (!user) {
      next(new ApiError(401, 'Not authorized, user not found'));
      return;
    }
    
    // Attach user and token to request
    req.user = user;
    // Use type assertion to add token to request
    (req as any).token = token;
    
    next();
  } catch (error) {
    logger.error(`Auth middleware error: ${error instanceof Error ? error.message : String(error)}`);
    next(new ApiError(401, 'Not authorized, authentication failed'));
  }
}