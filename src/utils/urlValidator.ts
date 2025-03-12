import { PlaywrightCrawler } from 'crawlee';
import { logger } from '../utils/logger';

/**
 * Validates if a URL is accessible
 * Used as a quick check before running the full crawler
 * 
 * @param url The URL to check
 * @returns Boolean indicating if the URL is valid and accessible
 */
export async function validateUrlAccessibility(url: string): Promise<boolean> {
  logger.info(`Validating URL accessibility: ${url}`);
  
  // Create a minimal crawler that just checks if the URL is accessible
  const crawler = new PlaywrightCrawler({
    headless: true,
    maxRequestsPerCrawl: 1,
    maxRequestRetries: 1,
    navigationTimeoutSecs: 15,
    
    async requestHandler({ page, request, log }) {
      log.info(`Checking URL: ${request.url}`);
      
      // Wait for just the basic HTML to load, don't wait for all resources
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
      
      // Check if we have actual content or just a 404 page
      const title = await page.title();
      const statusCode = request.userData.statusCode || 200;
      const has404 = title.includes('404') || title.includes('Not Found');
      
      if (statusCode >= 400 || has404) {
        log.error(`Invalid URL: ${request.url}, Status: ${statusCode}, Title: ${title}`);
        throw new Error(`Page not found or not accessible: ${request.url}`);
      }
      
      log.info(`URL is valid and accessible: ${request.url}`);
      // Don't return anything - void is expected
    },
    
    // Handle pre-navigation hook to catch HTTP errors
    preNavigationHooks: [
      async (crawlingContext, gotoOptions) => {
        const { request } = crawlingContext;
        try {
          const response = await crawlingContext.page.goto(request.url, gotoOptions);
          request.userData.statusCode = response?.status() || 200;
        } catch (error) {
          request.userData.statusCode = 500;
          logger.error(`Navigation error for ${request.url}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    ],
    
    // Handle failed requests
    failedRequestHandler({ request, log }) {
      log.error(`URL validation failed: ${request.url}`);
      // Don't return anything - void is expected
    },
  });
  
  try {
    let isValid = false;
    
    // Run the crawler and capture the result
    await crawler.run([url])
      .then(() => {
        isValid = true;
      })
      .catch(() => {
        isValid = false;
      });
    
    return isValid;
  } catch (error) {
    logger.error(`URL validation error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}