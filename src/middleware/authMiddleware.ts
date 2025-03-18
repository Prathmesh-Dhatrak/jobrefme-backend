import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { ApiError } from '../utils/errorHandler';
import { IUser } from '../models/User';

/**
 * Middleware to authenticate requests using JWT
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  passport.authenticate('jwt', { session: false }, (err: Error, user: IUser, info: any) => {
    if (err) {
      return next(err);
    }
    
    if (!user) {
      return next(new ApiError(401, info?.message || 'Unauthorized - Authentication required'));
    }
    
    req.user = user;
    next();
  })(req, res, next);
};

/**
 * Optional authentication middleware
 * Authenticates if token is provided but doesn't fail if not
 */
export const optionalAuthentication = (req: Request, res: Response, next: NextFunction): void => {
  passport.authenticate('jwt', { session: false }, (_err: Error, user: IUser) => {
    if (user) {
      req.user = user;
    }
    next();
  })(req, res, next);
};

/**
 * Middleware to check if user is authenticated with Google
 */
export const requireGoogleAuth = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    return next(new ApiError(401, 'Authentication required'));
  }
  
  const user = req.user as IUser;
  
  if (!user.googleId) {
    return next(new ApiError(403, 'Google authentication required for this resource'));
  }
  
  next();
};