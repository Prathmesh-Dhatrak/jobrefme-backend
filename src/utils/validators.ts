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
  
  if (req.body.apiKey !== undefined) {
    if (typeof req.body.apiKey !== 'string') {
      return next(new ApiError(400, 'API key must be a string'));
    }
    
    if (req.body.apiKey.trim() === '') {
      return next(new ApiError(400, 'API key cannot be empty'));
    }
    
    if (!isValidApiKeyFormat(req.body.apiKey)) {
      return next(new ApiError(400, 'Invalid API key format'));
    }
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
export function isValidApiKeyFormat(ApiKey: string): boolean {
  const apiKey = ApiKey.trim();
  
  if (apiKey.length < 20) {
    return false;
  }
  
  if (!/^[A-Za-z0-9_-]+$/.test(apiKey)) {
    return false;
  }
  
  return true;
} 