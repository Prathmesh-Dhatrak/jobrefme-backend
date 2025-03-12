import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';

export class ApiError extends Error {
  statusCode: number;
  
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error | ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(err);
  
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message
    });
    return;
  }
  
  if (err.message.includes('crawler') || err.message.includes('scrape')) {
    res.status(502).json({
      success: false,
      error: 'Could not retrieve job posting data. Please check the URL and try again.'
    });
    return;
  }
  
  if (err.message.includes('generate') || err.message.includes('AI')) {
    res.status(503).json({
      success: false,
      error: 'Could not generate reference message. Please try again later.'
    });
    return;
  }
  
  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred. Please try again later.'
  });
}