import { logger } from './logger';
import { load, CheerioAPI } from 'cheerio';

interface ParsedJobData {
  title: string;
  company: string;
  description: string;
  location?: string;
  salary?: string;
  jobType?: string;
  postedDate?: string;
}

/**
 * Clean HTML content by removing tags and normalizing whitespace
 * Optimized version with regex caching for better performance
 */
function cleanHtmlContent(html: string): string {
  // Cache regex patterns to improve performance
  const scriptRegex = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
  const styleRegex = /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi;
  const tagRegex = /<[^>]*>/g;
  const whitespaceRegex = /\s+/g;
  
  return html
    .replace(scriptRegex, '')
    .replace(styleRegex, '')
    .replace(tagRegex, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(whitespaceRegex, ' ')
    .trim();
}

/**
 * Clean text content by removing extra whitespace and unwanted text
 */
export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Specialized parser for HireJobs HTML content with parallel processing
 * 
 * @param html Raw HTML content from the job posting page
 * @returns Structured job data
 */
export async function parseHireJobsHTML(html: string): Promise<ParsedJobData> {
  logger.info('Parsing HireJobs HTML content');
  
  const result: ParsedJobData = {
    title: 'Job Position',
    company: 'Company',
    description: '',
  };
  
  try {
    const $ = load(html);
    
    // Run multiple parsing strategies in parallel
    const [
      hiringPattern,
      metaData,
      sectionData,
      titleData,
      companyData,
      descriptionData,
      locationData,
      structuredData
    ] = await Promise.all([
      // Extract hiring pattern
      parseHiringPattern($),
      
      // Extract metadata (job type, salary, etc.)
      parseMetaData($),
      
      // Extract content sections (responsibilities, requirements, etc.)
      parseSections($),
      
      // Extract job title from various sources
      parseJobTitle($, html),
      
      // Extract company name from various sources
      parseCompanyName($, html),
      
      // Extract job description from various sources
      parseDescription($, html),
      
      // Extract location/salary/job type
      parseLocationAndDetails($, html),
      
      // Parse JSON-LD structured data
      parseStructuredData(html)
    ]);
    
    // Apply extracted data with priorities
    
    // Apply hiring pattern data
    if (hiringPattern.company) {
      result.company = hiringPattern.company;
    }
    if (hiringPattern.title) {
      result.title = hiringPattern.title;
    }
    
    // Apply metadata
    if (metaData.jobType) {
      result.jobType = metaData.jobType;
    }
    if (metaData.salary) {
      result.salary = metaData.salary;
    }
    if (metaData.experienceInfo) {
      result.description = `Experience Required: ${metaData.experienceInfo}\n\n${result.description}`;
    }
    
    // Apply location data
    if (locationData.location) {
      result.location = locationData.location;
    }
    if (locationData.salary && !result.salary) {
      result.salary = locationData.salary;
    }
    if (locationData.jobType && !result.jobType) {
      result.jobType = locationData.jobType;
    }
    
    // Apply section content to description
    if (sectionData.sections && Object.keys(sectionData.sections).length > 0) {
      let descriptionParts = [];
      for (const [section, content] of Object.entries(sectionData.sections)) {
        descriptionParts.push(`${section}:\n${content}`);
      }
      
      result.description = descriptionParts.join('\n\n');
    }
    
    // Add skills if not already included
    if (sectionData.skills && !result.description.includes('Skills')) {
      result.description += '\n\nSkills Required:\n' + sectionData.skills.join('\n');
    }
    
    // Apply title data with priority
    if (titleData.titleFromMeta && (!result.title || result.title === 'Job Position')) {
      result.title = titleData.titleFromMeta;
    } else if (titleData.titleFromHeader && (!result.title || result.title === 'Job Position')) {
      result.title = titleData.titleFromHeader;
    }
    
    // Apply company data with priority
    if (companyData.companyFromMeta && (!result.company || result.company === 'Company')) {
      result.company = companyData.companyFromMeta;
    } else if (companyData.companyFromDOM && (!result.company || result.company === 'Company')) {
      result.company = companyData.companyFromDOM;
    }
    
    // Apply description as fallback
    if (!result.description || result.description.length < 50) {
      if (descriptionData.description && descriptionData.description.length > 50) {
        result.description = descriptionData.description;
      }
    }
    
    // Apply structured data as fallbacks
    if (structuredData) {
      if (structuredData.title && (!result.title || result.title === 'Job Position')) {
        result.title = structuredData.title;
      }
      
      if (structuredData.company && (!result.company || result.company === 'Company')) {
        result.company = structuredData.company;
      }
      
      if (structuredData.description && (!result.description || result.description.length < 50)) {
        result.description = structuredData.description;
      }
      
      if (structuredData.location && !result.location) {
        result.location = structuredData.location;
      }
      
      if (structuredData.salary && !result.salary) {
        result.salary = structuredData.salary;
      }
      
      if (structuredData.jobType && !result.jobType) {
        result.jobType = structuredData.jobType;
      }
      
      if (structuredData.postedDate) {
        result.postedDate = structuredData.postedDate;
      }
    }
    
    // Final cleanup
    if (result.title) {
      result.title = result.title.replace(/hirejobs/gi, '').trim();
      if (result.title === '' || result.title.toLowerCase() === 'job details') {
        result.title = 'Job Position';
      }
    }
    
    if (result.company) {
      result.company = result.company.replace(/hirejobs/gi, '').trim();
      if (result.company === '' || result.company === 'Company on') {
        result.company = 'Company on HireJobs';
      }
    }
    
    logger.info(`Parsed job data: ${result.title} at ${result.company}`);
    return result;
  } catch (error) {
    logger.error('Error parsing HireJobs HTML:', error);
    return result;
  }
}

/**
 * Parse hiring pattern from text
 */
async function parseHiringPattern($: CheerioAPI): Promise<{ company: string; title: string }> {
  const hiringText = $('h1, h2, h3, div, p')
    .filter((_, el) => $(el).text().includes('is hiring for'))
    .first()
    .text()
    .trim();
  
  if (hiringText && hiringText.includes('is hiring for')) {
    const parts = hiringText.split('is hiring for');
    if (parts.length >= 2) {
      const company = parts[0].trim();
      const title = parts[1].split('|')[0].trim();
      return { company, title };
    }
  }
  
  return { company: '', title: '' };
}

/**
 * Parse metadata like job type, salary
 */
async function parseMetaData($: CheerioAPI): Promise<{ jobType: string; salary: string; experienceInfo: string }> {
  const metaText = $('div, span, p')
    .filter((_, el) => {
      const text = $(el).text().trim();
      return text.includes('Fulltime') || 
             text.includes('Part-time') || 
             text.includes('LPA') ||
             text.includes('years');
    })
    .first()
    .text()
    .trim();
  
  let jobType = '';
  let salary = '';
  let experienceInfo = '';
  
  if (metaText) {
    const metaParts = metaText.split('•').map((part: string) => part.trim());
    
    metaParts.forEach((part: string) => {
      if (part.includes('Fulltime') || part.includes('Part-time') || part.includes('Contract')) {
        jobType = part;
      } else if (part.includes('LPA') || part.includes('salary')) {
        salary = part;
      } else if (part.includes('years')) {
        experienceInfo = part;
      }
    });
  }
  
  return { jobType, salary, experienceInfo };
}

/**
 * Parse content sections
 */
async function parseSections($: CheerioAPI): Promise<{ sections: {[key: string]: string}; skills: string[] | null }> {
  const sections = ['Responsibilities', 'Requirements', 'Qualifications', 'About the company', 'Skills'];
  let sectionContents: {[key: string]: string} = {};
  
  // Parse regular sections
  sections.forEach(section => {
    $('h2, h3, h4, strong, b').filter((_, el) => {
      return $(el).text().trim().includes(section);
    }).each((_, el) => {
      let sectionContent = '';
      let nextEl = $(el).next();

      while (nextEl.length && 
             !sections.some(s => nextEl.text().includes(s)) &&
             !nextEl.is('h2') && 
             !nextEl.is('h3') && 
             !nextEl.is('h4')) {
        
        const text = nextEl.text().trim();
        if (text) {
          sectionContent += text + '\n';
        }
        nextEl = nextEl.next();
      }
      
      if (sectionContent.trim()) {
        sectionContents[section] = sectionContent.trim();
      }
    });
  });
  
  // Parse skills lists
  const skillsList = $('ul, ol').filter((_, el) => {
    return $(el).text().includes('Skills Required') || 
           $(el).prev().text().includes('Skills');
  }).first();
  
  let skills: string[] = [];
  if (skillsList.length) {
    skills = skillsList.find('li').map((_, el) => $(el).text().trim()).get();
  }
  
  return { sections: sectionContents, skills: skills.length > 0 ? skills : null };
}

/**
 * Parse job title from various sources
 */
async function parseJobTitle(_$: CheerioAPI, html: string): Promise<{ titleFromMeta: string; titleFromHeader: string }> {
  let titleFromMeta = '';
  let titleFromHeader = '';
  
  // From page title
  const titleMatch = html.match(/<title>(.*?)\s*\|\s*HireJobs<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const titleParts = titleMatch[1].split(' at ');
    if (titleParts.length > 1) {
      titleFromMeta = titleParts[0].trim();
    } else {
      titleFromMeta = titleMatch[1].trim();
    }
  }
  
  // From OpenGraph meta
  const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (ogTitleMatch && ogTitleMatch[1]) {
    const ogTitle = ogTitleMatch[1].trim();
    if (ogTitle.toLowerCase() !== 'hirejobs' && !ogTitle.toLowerCase().includes('404')) {
      if (ogTitle.includes(' at ')) {
        const parts = ogTitle.split(' at ');
        titleFromMeta = parts[0].trim();
      } else {
        titleFromMeta = ogTitle;
      }
    }
  }
  
  // From H1 tags
  const h1Matches = html.match(/<h1[^>]*>(.*?)<\/h1>/gi);
  if (h1Matches) {
    for (const h1Tag of h1Matches) {
      const content = cleanHtmlContent(h1Tag);
      if (content && content.length > 3 && content.length < 100 && 
          !content.toLowerCase().includes('hirejobs') && 
          !content.toLowerCase().includes('404')) {
        titleFromHeader = content;
        break;
      }
    }
  }
  
  // From H2 tags (fallback)
  if (!titleFromHeader) {
    const h2Matches = html.match(/<h2[^>]*>(.*?)<\/h2>/gi);
    if (h2Matches) {
      for (const h2Tag of h2Matches) {
        const content = cleanHtmlContent(h2Tag);
        if (content && content.length > 3 && content.length < 100 && 
            !content.toLowerCase().includes('hirejobs') && 
            !content.toLowerCase().includes('404')) {
          titleFromHeader = content;
          break;
        }
      }
    }
  }
  
  return { titleFromMeta, titleFromHeader };
}

/**
 * Parse company name from various sources
 */
async function parseCompanyName(_$: CheerioAPI, html: string): Promise<{ companyFromMeta: string; companyFromDOM: string }> {
  let companyFromMeta = '';
  let companyFromDOM = '';
  
  // From title tag
  const titleMatch = html.match(/<title>(.*?)\s*\|\s*HireJobs<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const titleParts = titleMatch[1].split(' at ');
    if (titleParts.length > 1) {
      companyFromMeta = titleParts[1].trim();
    }
  }
  
  // From OG tags
  const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (ogTitleMatch && ogTitleMatch[1]) {
    const ogTitle = ogTitleMatch[1].trim();
    if (ogTitle.includes(' at ')) {
      const parts = ogTitle.split(' at ');
      if (parts.length > 1) {
        companyFromMeta = parts[1].trim();
      }
    }
  }
  
  // From company-related DOM elements
  const companyMatches = [
    html.match(/<div[^>]*class="[^"]*company-name[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
    html.match(/<span[^>]*class="[^"]*company-name[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
    html.match(/<h2[^>]*class="[^"]*company[^"]*"[^>]*>([\s\S]*?)<\/h2>/i),
    html.match(/<div[^>]*class="[^"]*employer[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
    html.match(/<div[^>]*class="[^"]*organization[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
  ];
  
  for (const match of companyMatches) {
    if (match && match[1] && match[1].trim().length > 0) {
      companyFromDOM = cleanHtmlContent(match[1]);
      if (companyFromDOM && companyFromDOM.length > 2) break;
    }
  }
  
  return { companyFromMeta, companyFromDOM };
}

/**
 * Parse location, salary and job type from various sources
 */
async function parseLocationAndDetails($: CheerioAPI, html: string): Promise<{ location: string; salary: string; jobType: string }> {
  let location = '';
  let salary = '';
  let jobType = '';
  
  // Parse location
  const locationText = $('div, span, p')
    .filter((_, el) => {
      const text = $(el).text().trim();
      return text.includes('India') || 
            text.includes('Remote') || 
            text.includes('Location');
    })
    .first()
    .text()
    .trim();
  
  if (locationText) {
    location = locationText.split('•')[0].trim();
  }
  
  // Look for specific location tags
  if (!location) {
    const locationMatches = [
      html.match(/<span[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
      html.match(/<div[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
      html.match(/<p[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
    ];
    
    for (const match of locationMatches) {
      if (match && match[1] && match[1].trim().length > 0) {
        location = cleanHtmlContent(match[1]);
        break;
      }
    }
  }
  
  // Look for salary
  const salaryMatches = [
    html.match(/<span[^>]*class="[^"]*salary[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
    html.match(/<div[^>]*class="[^"]*salary[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
    html.match(/<p[^>]*class="[^"]*salary[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
  ];
  
  for (const match of salaryMatches) {
    if (match && match[1] && match[1].trim().length > 0) {
      salary = cleanHtmlContent(match[1]);
      break;
    }
  }
  
  // Look for job type
  const typeMatches = [
    html.match(/<span[^>]*class="[^"]*job-type[^"]*"[^>]*>([\s\S]*?)<\/span>/i),
    html.match(/<div[^>]*class="[^"]*job-type[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
    html.match(/<p[^>]*class="[^"]*job-type[^"]*"[^>]*>([\s\S]*?)<\/p>/i),
    html.match(/<span[^>]*class="[^"]*employment-type[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
  ];
  
  for (const match of typeMatches) {
    if (match && match[1] && match[1].trim().length > 0) {
      jobType = cleanHtmlContent(match[1]);
      break;
    }
  }
  
  return { location, salary, jobType };
}

/**
 * Parse job description from various sources
 */
async function parseDescription(_$: CheerioAPI, html: string): Promise<{ description: string }> {
  const descriptionMatches = [
    html.match(/<div[^>]*class="[^"]*job-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
    html.match(/<div[^>]*class="[^"]*description-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
    html.match(/<div[^>]*id="[^"]*job-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
    html.match(/<section[^>]*class="[^"]*job-details[^"]*"[^>]*>([\s\S]*?)<\/section>/i),
    html.match(/<div[^>]*class="[^"]*details[^"]*"[^>]*>([\s\S]*?)<\/div>/i),
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  ];
  
  let longestDescription = '';
  for (const match of descriptionMatches) {
    if (match && match[1] && match[1].trim().length > 50) {
      const cleanDesc = cleanHtmlContent(match[1]);
      if (cleanDesc.length > longestDescription.length) {
        longestDescription = cleanDesc;
      }
    }
  }
  
  // Fallback to main content
  if (!longestDescription) {
    const mainContentMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainContentMatch && mainContentMatch[1]) {
      longestDescription = cleanHtmlContent(mainContentMatch[1]);
    }
  }
  
  return { description: longestDescription };
}

/**
 * Parse structured data from JSON-LD scripts
 */
async function parseStructuredData(html: string): Promise<{
  title: string;
  company: string;
  description: string;
  location: string;
  salary: string;
  jobType: string;
  postedDate: string;
} | null> {
  const structuredDataMatches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/ig);
  if (!structuredDataMatches) {
    return null;
  }
  
  for (const jsonLdString of structuredDataMatches) {
    try {
      const jsonContent = jsonLdString.replace(/<script\s+type="application\/ld\+json">/i, '')
                                     .replace(/<\/script>/i, '');
      const structuredData = JSON.parse(jsonContent);
      
      if (structuredData && structuredData['@type'] === 'JobPosting') {
        // Extract job data from structured data
        const title = structuredData.title || '';
        
        // Extract company
        let company = '';
        if (structuredData.hiringOrganization) {
          company = typeof structuredData.hiringOrganization === 'string' 
            ? structuredData.hiringOrganization 
            : structuredData.hiringOrganization.name || '';
        }
        
        // Extract description
        const description = typeof structuredData.description === 'string'
          ? structuredData.description
          : JSON.stringify(structuredData.description);
        
        // Extract location
        let location = '';
        if (structuredData.jobLocation) {
          location = typeof structuredData.jobLocation === 'string'
            ? structuredData.jobLocation
            : structuredData.jobLocation.address
              ? (structuredData.jobLocation.address.addressLocality || 
                 structuredData.jobLocation.address.addressRegion || 
                 structuredData.jobLocation.address.addressCountry)
              : '';
        }
        
        // Extract salary
        let salary = '';
        if (structuredData.baseSalary) {
          salary = typeof structuredData.baseSalary === 'string'
            ? structuredData.baseSalary
            : structuredData.baseSalary.value
              ? `${structuredData.baseSalary.value.value || ''} ${structuredData.baseSalary.value.unitText || ''}`
              : '';
        }
        
        // Extract other data
        const jobType = structuredData.employmentType || '';
        const postedDate = structuredData.datePosted || '';
        
        return {
          title,
          company,
          description,
          location,
          salary,
          jobType,
          postedDate
        };
      }
    } catch (jsonError) {
      logger.warn('Failed to parse JSON-LD structured data');
    }
  }
  
  return null;
}