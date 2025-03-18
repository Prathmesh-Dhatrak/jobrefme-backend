import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import User, { IUser } from '../models/User';
import { ApiError } from '../utils/errorHandler';
import { logger } from '../utils/logger';

/**
 * Generate JWT token for authenticated user
 */
const generateToken = (user: IUser): string => {
  return jwt.sign(
    { id: user._id, email: user.email },
    process.env.JWT_SECRET || 'your_jwt_secret_key',
    { expiresIn: '30d' }
  );
};

/**
 * Google OAuth login
 */
export const googleLogin = passport.authenticate('google', { scope: ['profile', 'email'] });

/**
 * Google OAuth callback
 */
export const googleCallback = (req: Request, res: Response, next: NextFunction): void => {
  passport.authenticate('google', { session: false }, (err: Error, user: IUser) => {
    if (err) {
      logger.error(`Google callback error: ${err}`);
      return res.redirect(`${process.env.FRONTEND_URL || '/'}/auth/error`);
    }
    
    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL || '/'}/auth/error`);
    }
    
    // Generate token
    const token = generateToken(user);
    
    // Redirect to frontend with token
    res.redirect(`${process.env.FRONTEND_URL || '/'}/auth/success?token=${token}`);
  })(req, res, next);
};

/**
 * Get current user profile
 */
export const getCurrentUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user as IUser;
      
      // Check if user has a Gemini API key (without returning the key itself)
      const userWithApiKey = await User.findById(user._id).select('+apiKeys.gemini');
      const hasApiKey = Boolean(userWithApiKey?.apiKeys?.gemini);
      
      res.json({
        success: true,
        user: {
          id: user._id.toString(),
          email: user.email,
          displayName: user.displayName,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePicture: user.profilePicture,
          createdAt: user.createdAt,
          hasApiKey
        }
      });
    } catch (error) {
      next(error);
    }
  };

/**
 * Store Gemini API key for user
 */
export const storeApiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user as IUser;
    const { geminiApiKey } = req.body;
    
    if (!geminiApiKey) {
      throw new ApiError(400, 'API key is required');
    }
    
    // Get full user document with apiKeys field
    const fullUser = await User.findById(user._id);
    if (!fullUser) {
      throw new ApiError(404, 'User not found');
    }
    
    // Encrypt and store the API key
    await fullUser.setGeminiApiKey(geminiApiKey);
    
    res.json({
      success: true,
      message: 'API key stored successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user has a Gemini API key
 */
export const checkApiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await User.findById((req.user as IUser)._id).select('+apiKeys.gemini');
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    const hasApiKey = Boolean(user.apiKeys?.gemini);
    
    res.json({
      success: true,
      hasApiKey
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete user's Gemini API key
 */
export const deleteApiKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user as IUser;
    
    await User.findByIdAndUpdate(user._id, {
      $unset: { 'apiKeys.gemini': 1 }
    });
    
    res.json({
      success: true,
      message: 'API key deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};