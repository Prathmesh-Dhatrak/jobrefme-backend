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
 * Checks if URL is from HireJobs.in
 */
export function isHireJobsUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    
    // Check if hostname is hirejobs.in or www.hirejobs.in
    const isHireJobsDomain = hostname === 'hirejobs.in' || hostname === 'www.hirejobs.in';
    
    // Check if pathname follows the jobs/[id] pattern
    const jobPathPattern = /^\/jobs\/[a-zA-Z0-9]+$/;
    const hasValidJobPath = jobPathPattern.test(pathname);
    
    return isHireJobsDomain && hasValidJobPath;
  } catch (_error) {
    return false;
  }
}