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
  
  if (!isHireJobsUrl(jobUrl)) {
    return next(new ApiError(400, 'Only HireJobs.in URLs are supported'));
  }
  
  next();
}

/**
 * Validates job URL request for cache clearing
 * Allows both valid HireJobs URLs and the special 'all' value
 */
export function validateClearCacheRequest(req: Request, _res: Response, next: NextFunction) {
  const { jobUrl } = req.body;
  
  if (!jobUrl) {
    return next(new ApiError(400, 'Job URL is required'));
  }

  if (typeof jobUrl !== 'string') {
    return next(new ApiError(400, 'Job URL must be a string'));
  }

  // Special case for clearing all cache
  if (jobUrl === 'all') {
    return next();
  }

  if (!isValidUrl(jobUrl)) {
    return next(new ApiError(400, 'Invalid URL format'));
  }
  
  if (!isHireJobsUrl(jobUrl)) {
    return next(new ApiError(400, 'Only HireJobs.in URLs are supported'));
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
 * Checks if URL valid
 */
export function isHireJobsUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    const isHireJobsDomain = hostname === 'hirejobs.in' || hostname === 'www.hirejobs.in';
    const jobPathPattern = /^\/jobs\/[a-zA-Z0-9]+$/;
    const hasValidJobPath = jobPathPattern.test(pathname);
    
    return isHireJobsDomain && hasValidJobPath;
  } catch (_error) {
    return false;
  }
}

/**
 * Performs a basic format check for Gemini API keys
 * This is a simple validation, not a comprehensive check
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  const trimmedKey = apiKey.trim();
  
  if (trimmedKey.length < 20) {
    return false;
  }
  
  if (!/^[A-Za-z0-9_-]+$/.test(trimmedKey)) {
    return false;
  }
  
  return true;
}

/**
 * Validates raw job content request
 * Ensures the content meets minimum requirements before processing
 */
export function validateJobContentRequest(req: Request, _res: Response, next: NextFunction) {
  const { jobContent } = req.body;
  
  if (!jobContent) {
    return next(new ApiError(400, 'Job content is required'));
  }

  if (typeof jobContent !== 'string') {
    return next(new ApiError(400, 'Job content must be a string'));
  }

  const content = jobContent.trim();
  
  if (content.length < 50) {
    return next(new ApiError(400, 'Job content is too short. Please provide more comprehensive job details (minimum 50 characters).'));
  }
  
  if (!/\w+/.test(content)) {
    return next(new ApiError(400, 'Job content must contain text'));
  }
  
  next();
}