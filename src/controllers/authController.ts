import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { logger } from '../utils/logger';
import { generateToken } from '../utils/jwtUtils';
import { ApiError } from '../utils/errorHandler';
import User from '../models/userModel';

/**
 * Initiate Google OAuth login flow
 * Required for Chrome extension authentication
 */
export function startGoogleAuth(req: Request, res: Response, next: NextFunction): void {
  // Store the extension return URL if provided
  if (req.query.returnUrl) {
    req.session.returnUrl = req.query.returnUrl as string;
  }
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })(req, res, next);
}

/**
 * Google OAuth callback handler
 * Issues JWT token and redirects back to the extension
 */
export function googleAuthCallback(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate('google', { session: false }, (err, user) => {
    try {
      if (err) {
        logger.error(`Google authentication error: ${err.message}`);
        return next(new ApiError(500, 'Authentication failed'));
      }
      
      if (!user) {
        return next(new ApiError(401, 'Authentication failed'));
      }
      
      // Generate JWT token
      const token = generateToken(user);
      
      // Get return URL from session (or use default)
      const returnUrl = req.session.returnUrl || process.env.EXTENSION_URL || 'chrome-extension://';
      
      // Clear the session return URL
      req.session.returnUrl = undefined;
      
      // For Chrome extension: redirect to extension page with token
      // The extension will capture this token and store it locally
      const redirectUrl = `${returnUrl}?token=${token}`;
      
      logger.info(`Authentication successful for user: ${user.email}`);
      res.redirect(redirectUrl);
    } catch (error) {
      logger.error(`Error in Google callback: ${error instanceof Error ? error.message : String(error)}`);
      next(new ApiError(500, 'Authentication failed'));
    }
  })(req, res, next);
}

/**
 * Regular login endpoint (for testing and backup)
 */
export function login(_req: Request, res: Response, next: NextFunction): void {
  try {
    res.status(200).json({
      success: true,
      message: 'Please use Google OAuth for authentication',
      googleAuthUrl: '/api/v1/auth/google'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Logout endpoint
 */
export function logout(_req: Request, res: Response, next: NextFunction): void {
  try {
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get user profile information
 */
export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized');
    }
    
    // Find user with fresh data
    const user = await User.findById(req.user._id);
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    // Check if user has a Gemini API key
    const hasApiKey = Boolean(await user.getGeminiApiKey());
    
    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        googleId: user.googleId,
        email: user.email,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePhoto: user.profilePhoto,
        hasGeminiApiKey: hasApiKey,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
}