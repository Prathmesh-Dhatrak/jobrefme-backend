import { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler';

/**
 * Validates job URL request
 */
export function validateJobUrlRequest(req: Request, _res: Response, next: NextFunction) {
  const { jobUrl } = req.body;
  
  if (!jobUrl) {
    return next(new ApiError(400, 'Job URL is required'));
  }

  if (typeof jobUrl !== 'string') {
    return next(new ApiError(400, 'Job URL must be a string'));
  }

  if (!isValidUrl(jobUrl)) {
    return next(new ApiError(400, 'Invalid URL format'));
  }
  if (!isSupportedJobBoard(jobUrl)) {
    return next(new ApiError(400, 'URL must be from a supported job board'));
  }
  
  next();
}

/**
 * Validates if string is a valid URL
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Checks if URL is from a supported job board
 */
export function isSupportedJobBoard(url: string): boolean {
  const supportedDomains = [
    'linkedin.com',
    'indeed.com',
    'glassdoor.com',
    'monster.com',
    'ziprecruiter.com',
    'dice.com',
    'careerbuilder.com',
    'simplyhired.com',
    'builtin.com',
    'stackoverflow.com/jobs',
    'wellfound.com',
    'lever.co',
    'greenhouse.io'
  ];
  
  try {
    const { hostname } = new URL(url);
    return supportedDomains.some(domain => hostname.includes(domain));
  } catch (_error) {
    return false;
  }
}