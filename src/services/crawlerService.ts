import { PlaywrightCrawler } from 'crawlee';
import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { JobData } from '../types/types';
import { parseHireJobsHTML } from '../utils/hirejobs-parser';

const USE_MOCK_CRAWLER = process.env.MOCK_CRAWLER === 'true';

/**
 * Specialized crawler for HireJobs.in job postings
 * 
 * @param jobUrl URL of the HireJobs job posting
 * @returns JobData object containing extracted content
 */
export async function scrapeJobPosting(jobUrl: string): Promise<JobData | null> {
  logger.info(`Starting crawler for HireJobs URL: ${jobUrl}`);
  
  if (USE_MOCK_CRAWLER) {
    logger.info('Using mock crawler data (MOCK_CRAWLER=true)');
    return getMockJobData(jobUrl);
  }
  
  let jobData: JobData | null = null;
  
  try {
    const crawler = new PlaywrightCrawler({
      headless: true,
      navigationTimeoutSecs: 60,
      
      async requestHandler({ page, request, log }) {
        log.info(`Processing ${request.url}`);
        
        await page.setExtraHTTPHeaders({
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        });
        
        await page.waitForLoadState('domcontentloaded');
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        try {
          await page.waitForSelector('.job-container, main, h1, article', { timeout: 5000 });
        } catch (err) {
          log.info('Timed out waiting for job content selectors, continuing anyway');
        }
        
        if (process.env.NODE_ENV === 'development') {
          try {
            await page.screenshot({ path: `screenshots/job-${new Date().getTime()}.png`, fullPage: true });
            log.info('Screenshot saved to screenshots directory');
          } catch (screenshotError) {
            logger.error('Failed to take screenshot', 
              screenshotError instanceof Error ? screenshotError : String(screenshotError));
          }
        }
        
        jobData = await extractHireJobsData(page, request.url);
        
        log.info(`Extracted job data: ${JSON.stringify({
          title: jobData.title,
          company: jobData.company,
          descriptionLength: jobData.description ? jobData.description.length : 0
        })}`);
      },
      
      failedRequestHandler({ request, log, error }) {
        log.error(`Request failed (${request.url}): ${error instanceof Error ? error.message : String(error)}`);
      },
    });
    
    await crawler.run([jobUrl]);
    
    return jobData;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Crawler error: ${errorMessage}`);
    
    if (process.env.NODE_ENV === 'development') {
      logger.info('Falling back to mock data due to crawler error');
      return getMockJobData(jobUrl);
    }
    
    throw error;
  }
}

/**
 * Extract job data from HireJobs.in pages using multiple extraction methods
 */
async function extractHireJobsData(page: Page, url: string): Promise<JobData> {
  try {
    const jobId = url.split('/').pop() || '';
    logger.info(`Extracting data for HireJobs job ID: ${jobId}`);
    
    let jobTitle = '';
    let companyName = '';
    let jobDescription = '';
    
    try {
      const pageTitle = await page.title();
      if (pageTitle && !pageTitle.includes('404') && !pageTitle.includes('Error')) {
        const titleParts = pageTitle.split(/\s*\|\s*/)[0].trim();
        const atIndex = titleParts.indexOf(' at ');
        
        if (atIndex > 0) {
          jobTitle = titleParts.substring(0, atIndex).trim();
          companyName = titleParts.substring(atIndex + 4).trim();
          logger.info(`Extracted from page title - Title: ${jobTitle}, Company: ${companyName}`);
        }
      }
    } catch (titleError) {
      logger.warn(`Title extraction error: ${titleError instanceof Error ? titleError.message : String(titleError)}`);
    }
    
    try {
      const dynamicSelectors = await page.evaluate(() => {
        const headings = Array.from(document.querySelectorAll('h1, h2'));
        const companyElements = Array.from(document.querySelectorAll(
          '.company, .company-name, .org, .organization, .employer, [itemprop="hiringOrganization"]'
        ));
        
        const descriptionElements = Array.from(document.querySelectorAll(
          '.description, .job-description, .details, .job-details, article, main, .content'
        ));
        
        let possibleTitles = [];
        for (const heading of headings) {
          if (heading.textContent) {
            possibleTitles.push(heading.textContent.trim());
          }
        }
        
        let possibleCompanies = [];
        for (const company of companyElements) {
          if (company.textContent) {
            possibleCompanies.push(company.textContent.trim());
          }
        }
        
        let possibleDescriptions = [];
        for (const desc of descriptionElements) {
          if (desc.textContent) {
            possibleDescriptions.push(desc.textContent.trim());
          }
        }
        
        return {
          titles: possibleTitles,
          companies: possibleCompanies,
          descriptions: possibleDescriptions
        };
      });
      
      if (dynamicSelectors.titles && dynamicSelectors.titles.length > 0) {
        const validTitles = dynamicSelectors.titles
          .filter(t => t.length > 3 && t.length < 100)
          .filter(t => !t.includes('HireJobs') && !t.includes('404'))
          .sort((a, b) => b.length - a.length);
        
        if (validTitles.length > 0) {
          if (!jobTitle) jobTitle = validTitles[0];
          logger.info(`Found job title from DOM: ${jobTitle}`);
        }
      }
      
      if (dynamicSelectors.companies && dynamicSelectors.companies.length > 0) {
        const validCompanies = dynamicSelectors.companies
          .filter(c => c.length > 2 && c.length < 50)
          .filter(c => !c.includes('HireJobs') && !c.includes('404'))
          .sort((a, b) => b.length - a.length);
        
        if (validCompanies.length > 0) {
          if (!companyName) companyName = validCompanies[0];
          logger.info(`Found company name from DOM: ${companyName}`);
        }
      }
      
      if (dynamicSelectors.descriptions && dynamicSelectors.descriptions.length > 0) {
        const validDescriptions = dynamicSelectors.descriptions
          .filter(d => d.length > 50)
          .sort((a, b) => b.length - a.length);
        
        if (validDescriptions.length > 0) {
          jobDescription = validDescriptions[0];
          logger.info(`Found job description from DOM: ${jobDescription.substring(0, 50)}...`);
        }
      }
    } catch (domError) {
      logger.warn(`DOM extraction error: ${domError instanceof Error ? domError.message : String(domError)}`);
    }
    
    try {
      const html = await page.content();
      const parsedJobData = parseHireJobsHTML(html);
      
      if (!jobTitle || (parsedJobData.title !== 'Job Position' && 
                        parsedJobData.title.length > jobTitle.length)) {
        jobTitle = parsedJobData.title;
      }
      
      if (!companyName || (parsedJobData.company !== 'Company on HireJobs' && 
                          parsedJobData.company.length > companyName.length)) {
        companyName = parsedJobData.company;
      }

      if (!jobDescription || parsedJobData.description.length > jobDescription.length) {
        jobDescription = parsedJobData.description;
      }
      
      if (parsedJobData.location || parsedJobData.salary) {
        const additionalInfo = [];
        if (parsedJobData.location) additionalInfo.push(`Location: ${parsedJobData.location}`);
        if (parsedJobData.salary) additionalInfo.push(`Salary: ${parsedJobData.salary}`);
        if (parsedJobData.jobType) additionalInfo.push(`Job Type: ${parsedJobData.jobType}`);
        
        if (additionalInfo.length > 0 && jobDescription) {
          jobDescription += '\n\nAdditional Information:\n' + additionalInfo.join('\n');
        }
      }
      
      logger.info(`Combined extraction results - Title: ${jobTitle}, Company: ${companyName}, Description length: ${jobDescription.length} chars`);
    } catch (parserError) {
      logger.warn(`HTML parser error: ${parserError instanceof Error ? parserError.message : String(parserError)}`);
    }
    
    if (!jobTitle || !companyName || !jobDescription) {
      try {
        const metaData = await page.evaluate(() => {
          const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
          const metaDesc = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
          return { title: metaTitle, description: metaDesc };
        });
        
        if (metaData.title && !jobTitle) {
          const metaTitleParts = metaData.title.split(' at ');
          if (metaTitleParts.length > 1) {
            jobTitle = metaTitleParts[0].trim();
            if (!companyName) companyName = metaTitleParts[1].trim();
          } else {
            jobTitle = metaData.title;
          }
        }
        
        if (metaData.description && !jobDescription) {
          jobDescription = metaData.description;
        }
      } catch (metaError) {
        logger.warn(`Meta tag extraction error: ${metaError instanceof Error ? metaError.message : String(metaError)}`);
      }
    }
    
    if (!jobTitle) jobTitle = `Job Position (ID: ${jobId})`;
    if (!companyName) companyName = 'the company';
    if (!jobDescription || jobDescription.length < 50) {
      jobDescription = `This is a job posting with ID ${jobId}. Unfortunately, we couldn't extract detailed job description. The position appears to be for ${jobTitle} at ${companyName}.`;
    }
    
    jobTitle = jobTitle.replace(/^RE:\s*/i, '').replace(/^FWD:\s*/i, '');
    companyName = companyName.replace('HireJobs', '').replace(/^\s*at\s+/i, '').trim();
    
    return {
      title: jobTitle,
      company: companyName,
      description: jobDescription
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error extracting HireJobs data: ${errorMessage}`);
    
    return {
      title: 'Job Position',
      company: 'the company',
      description: 'Failed to extract job description. Please check the original posting.'
    };
  }
}

/**
 * Generate realistic mock job data for development
 */
function getMockJobData(_url: string): JobData {
  
  return {
    title: `Software Engineer`,
    company: 'Tech Innovations',
    description: `We are looking for a talented Software Engineer to join our team at Tech Innovations.

Responsibilities:
• Developing and maintaining web applications using modern JavaScript frameworks
• Writing clean, efficient, and well-documented code
• Collaborating with cross-functional teams including designers, product managers, and other developers
• Implementing responsive design and ensuring cross-browser compatibility
• Participating in code reviews and mentoring junior developers

Requirements:
• 3+ years of experience in software development
• Proficiency in JavaScript/TypeScript, HTML, CSS
• Experience with React, Node.js, and Express
• Familiarity with RESTful APIs and GraphQL
• Knowledge of version control systems (Git)
• Strong problem-solving skills and attention to detail
• Excellent communication skills

Benefits:
• Competitive salary
• Flexible work hours
• Remote work options
• Health insurance
• Professional development opportunities
• Collaborative and innovative work environment`
  };
}