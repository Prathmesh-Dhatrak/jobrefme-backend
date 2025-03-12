import { PlaywrightCrawler } from 'crawlee';
import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { JobData } from '../types/types';

const USE_MOCK_CRAWLER = process.env.MOCK_CRAWLER === 'true';

/**
 * Simple crawler that extracts text content from any job posting URL
 * 
 * @param jobUrl URL of the job posting
 * @returns JobData object containing extracted content
 */
export async function scrapeJobPosting(jobUrl: string): Promise<JobData | null> {
  logger.info(`Starting crawler for URL: ${jobUrl}`);
  
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
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        });
        
        await page.waitForLoadState('domcontentloaded');
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await page.waitForLoadState('networkidle');
        console.log('page content', await page.content());
        jobData = await extractJobData(page, request.url);
        
        log.info(`Extracted job data: ${JSON.stringify({
          title: jobData.title,
          company: jobData.company
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
 * Extract job data from any page regardless of structure
 */
async function extractJobData(page: Page, url: string): Promise<JobData> {
  try {
    let companyFromUrl = 'Unknown Company';
    try {
      const { hostname, pathname } = new URL(url);
      
      const domainParts = hostname.split('.');
      if (domainParts.length > 1 && domainParts[0] !== 'www' && domainParts[0] !== 'jobs') {
        companyFromUrl = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
      } 
      else if (hostname.includes('lever.co') || hostname.includes('greenhouse.io')) {
        const pathParts = pathname.split('/');
        if (pathParts.length > 1) {
          companyFromUrl = pathParts[1].charAt(0).toUpperCase() + pathParts[1].slice(1);
        }
      }
    } catch (_error) {
      // Silently fail and use default
    }

    let jobTitle = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h1, h2'));
      for (const heading of headings) {
        const text = heading.textContent?.trim() || '';
        if (text && text.length > 5 && text.length < 100 && 
            !text.toLowerCase().includes('login') && 
            !text.toLowerCase().includes('sign in')) {
          return text;
        }
      }
      return document.title;
    });
    
    let companyName = await page.evaluate(() => {
      const companyElements = Array.from(document.querySelectorAll(
        '[class*="company"], [class*="employer"], [class*="organization"], ' +
        '[itemprop="hiringOrganization"], .company-name, .employer'
      ));
      
      for (const element of companyElements) {
        const text = element.textContent?.trim() || '';
        if (text && text.length > 2 && text.length < 50) {
          return text;
        }
      }
      
      return '';
    });
    
    if (!companyName) {
      companyName = companyFromUrl;
    }
    
    const pageContent = await page.evaluate(() => {
      const elementsToHide = document.querySelectorAll(
        'nav, header, footer, [role="navigation"], ' +
        '[class*="nav"], [class*="menu"], [class*="header"], [class*="footer"], ' +
        '[id*="nav"], [id*="menu"], [id*="header"], [id*="footer"]'
      );
      
      const originalDisplays: string[] = [];
      elementsToHide.forEach(el => {
        const element = el as HTMLElement;
        originalDisplays.push(element.style.display);
        element.style.display = 'none';
      });
      
      const content = document.body.innerText;
      elementsToHide.forEach((el, i) => {
        const element = el as HTMLElement;
        element.style.display = originalDisplays[i];
      });
      
      return content;
    });
    jobTitle = jobTitle
      .replace(/^\s*[\-\|]\s*.+$/, '')
      .replace(/(.+)[\-\|]\s*.+$/, '$1')
      .trim();
    
    return {
      title: jobTitle || 'Job Position',
      company: companyName,
      description: pageContent
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error extracting job data: ${errorMessage}`);
    
    return {
      title: 'Job Position',
      company: 'Company',
      description: 'Failed to extract job description. Please check the original posting.'
    };
  }
}

/**
 * Generate mock job data for development
 */
function getMockJobData(url: string): JobData {
  let company = 'Example Company';
  let title = 'Software Engineer';
  
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname.includes('lever.co')) {
      const pathParts = pathname.split('/');
      if (pathParts.length > 1) {
        company = pathParts[1].charAt(0).toUpperCase() + pathParts[1].slice(1);
      }
    } else if (hostname.includes('linkedin.com')) {
      company = 'LinkedIn Company';
    } else if (hostname.includes('indeed.com')) {
      company = 'Indeed Company';
    } else {
      const domainParts = hostname.split('.');
      if (domainParts.length > 1 && domainParts[0] !== 'www' && domainParts[0] !== 'jobs') {
        company = domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1);
      }
    }
    if (pathname.includes('-')) {
      const jobPart = pathname.split('-').pop();
      if (jobPart && jobPart.length > 2) {
        title = `Software Engineer (${jobPart.slice(0, 5)})`;
      }
    }
  } catch (_error) {
    // Fallback to defaults if URL parsing fails
  }
  
  return {
    title,
    company,
    description: `This is a mock job description for ${title} at ${company}. This role involves developing software applications, collaborating with cross-functional teams, and implementing new features. Qualifications include proficiency in JavaScript/TypeScript, experience with web technologies, and strong problem-solving skills. The ideal candidate has 3+ years of experience in software development, excellent communication skills, and a passion for creating high-quality, maintainable code.`
  };
}