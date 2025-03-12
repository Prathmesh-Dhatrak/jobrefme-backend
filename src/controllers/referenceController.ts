import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { scrapeJobPosting } from '../services/crawlerService';
import { generateReferenceMessage } from '../services/aiService';
import { ApiError } from '../utils/errorHandler';

export async function generateReference(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { jobUrl } = req.body;
    
    logger.info(`Processing reference request for HireJobs URL: ${jobUrl}`);
    
    const jobId = extractJobId(jobUrl);
    logger.info(`Job ID: ${jobId}`);
    
    const jobData = await scrapeJobPosting(jobUrl);
    
    if (!jobData) {
      throw new ApiError(422, 'Could not extract job details from HireJobs');
    }
    
    let jobTitle = jobData.title.trim();
    let companyName = jobData.company.trim();
    
    if (jobTitle.includes(' at ')) {
      const titleParts = jobTitle.split(' at ');
      jobTitle = titleParts[0].trim();
      if (!companyName || companyName === 'the company') {
        companyName = titleParts[1].trim();
      }
    }
    
    if (companyName === 'Company on') {
      companyName = 'Company';
    }
    
    const referenceMessage = await generateReferenceMessage(
      jobTitle,
      companyName,
      jobData.description
    );
    
    res.status(200).json({
      success: true,
      referenceMessage,
      jobTitle,
      companyName,
      jobId
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Error generating HireJobs reference: ${errorMessage}`);
    next(error instanceof Error ? error : new Error(errorMessage));
  }
}

/**
 * Extract job ID from HireJobs URL
 */
function extractJobId(url: string): string {
  try {
    return url.split('/').pop() || 'unknown';
  } catch (error) {
    return 'unknown';
  }
}