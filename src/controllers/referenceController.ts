import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { scrapeJobPosting } from '../services/crawlerService';
import { generateReferenceMessage } from '../services/aiService';
import { ApiError } from '../utils/errorHandler';

export async function generateReference(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { jobUrl } = req.body;
    
    logger.info(`Processing reference request for URL: ${jobUrl}`);
    
    const jobData = await scrapeJobPosting(jobUrl);
    
    if (!jobData) {
      throw new ApiError(422, 'Could not extract job details from the provided URL');
    }
    
    const referenceMessage = await generateReferenceMessage(
      jobData.title,
      jobData.company,
      jobData.description
    );
    
    res.status(200).json({
      success: true,
      referenceMessage,
      jobTitle: jobData.title,
      companyName: jobData.company
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error generating reference: ${errorMessage}`);
    next(error instanceof Error ? error : new Error(errorMessage));
  }
}