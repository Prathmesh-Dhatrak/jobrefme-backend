import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';
import NodeCache from 'node-cache';
import User from '../models/userModel';
import Template from '../models/templateModel';
import mongoose from 'mongoose';
import { JobData } from '../types/types';

const CACHE_TTL = parseInt(process.env.CACHE_TTL || '3600', 10);
const defaultApiKey = process.env.GEMINI_API_KEY || '';

const messageCache = new NodeCache({
  stdTTL: CACHE_TTL,
  checkperiod: 120,
  useClones: false
});

const clientCache = new Map<string, GoogleGenerativeAI>();

if (defaultApiKey) {
  try {
    const client = new GoogleGenerativeAI(defaultApiKey);
    clientCache.set(defaultApiKey, client);
    logger.info('Default Gemini API client initialized');
  } catch (error) {
    logger.error('Failed to initialize default Gemini API client', error);
  }
}

/**
 * Generate a cache key from job data
 */
function generateCacheKey(userId: string | undefined, jobTitle: string, companyName: string, descriptionHash: string): string {
  return userId 
    ? `user:${userId}:${jobTitle.toLowerCase().trim()}:${companyName.toLowerCase().trim()}:${descriptionHash}`
    : `${jobTitle.toLowerCase().trim()}:${companyName.toLowerCase().trim()}:${descriptionHash}`;
}

/**
 * Simple hash function for text
 */
function hashString(text: string): string {
  let hash = 0;
  if (text.length === 0) return hash.toString();

  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return hash.toString();
}

/**
 * Initialize or retrieve a cached Gemini API client with the given API key
 * @param apiKey The API key to use
 * @returns GoogleGenerativeAI client
 * @throws Error if initialization fails or API key is missing
 */
function initGeminiClient(apiKey: string): GoogleGenerativeAI {
  if (!apiKey) {
    throw new Error('Gemini API key is missing or invalid');
  }

  if (clientCache.has(apiKey)) {
    return clientCache.get(apiKey)!;
  }

  try {
    const client = new GoogleGenerativeAI(apiKey);
    clientCache.set(apiKey, client);
    return client;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to initialize Gemini API client: ${errorMessage}`);
  }
}

/**
 * Get user's API key or fallback to default
 * @param userId User ID to retrieve API key for
 * @returns API key as string or null if neither user nor default key is available
 */
async function getUserApiKey(userId: string | undefined): Promise<string | null> {
  // If no user ID is provided, use default key
  if (!userId) {
    return defaultApiKey || null;
  }
  
  try {
    // Check if ID is valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      logger.warn(`Invalid user ID format: ${userId}`);
      return defaultApiKey || null;
    }
    
    const user = await User.findById(userId);
    if (!user) {
      logger.warn(`User not found for ID: ${userId}`);
      return defaultApiKey || null;
    }
    
    // Try to get user's API key
    const userApiKey = await user.getGeminiApiKey();
    
    // If user has no key, fall back to default
    return userApiKey || defaultApiKey || null;
  } catch (error) {
    logger.error(`Error retrieving user API key: ${error instanceof Error ? error.message : String(error)}`);
    return defaultApiKey || null;
  }
}

/**
 * Generates a referral request message using Google Gemini API
 * with caching to avoid redundant API calls
 * 
 * @param jobTitle The job title
 * @param companyName The company name
 * @param jobDescription The job description
 * @param userId Optional user ID to use their stored API key
 * @returns Generated referral message
 * @throws Error if generation fails
 */
export async function generateReferralMessage(
  jobTitle: string,
  companyName: string,
  jobDescription: string,
  userId?: string
): Promise<string> {
  const templateContent = await getActiveTemplate(userId);

  const descriptionPreview = jobDescription.slice(0, 1000);
  const descriptionHash = hashString(descriptionPreview);
  const cacheKey = generateCacheKey(userId, jobTitle, companyName, descriptionHash);

  const cachedMessage = messageCache.get<string>(cacheKey);
  if (cachedMessage) {
    logger.info(`Cache hit for: ${jobTitle} at ${companyName}${userId ? ` (user: ${userId})` : ''}`);
    return cachedMessage;
  }

  logger.info(`Generating referral message for ${jobTitle} at ${companyName}${userId ? ` (user: ${userId})` : ''}`);

  const apiKey = await getUserApiKey(userId);

  if (!apiKey) {
    throw new Error('No Gemini API key available. Please add an API key in your account settings.');
  }

  const client = initGeminiClient(apiKey);

  const prompt = createPrompt(jobTitle, companyName, jobDescription, templateContent);
  const modelName = 'gemini-1.5-flash';

  try {
    logger.info(`Using model: ${modelName} with ${userId ? 'user' : 'default'} API key`);

    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.5,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 500,
      },
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    logger.info(`Successfully generated referral message using ${modelName}`);

    let cleanedText = text.replace(/HireJobs/g, '')
      .replace(/hirejobs/gi, '')
      .replace(/as advertised on\s*\./, '')
      .replace(/as posted on\s*\./, '')
      .replace(/I hope this email finds you well\./g, '')
      .replace(/I hope this message finds you well\./g, '')
      .replace(/\n\n\n+/g, '\n\n')
      .trim();

    messageCache.set(cacheKey, cleanedText);

    return cleanedText;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error with model ${modelName}: ${errorMessage}`);

    if (errorMessage.includes('API key not valid')) {
      throw new Error('The API key is not valid. Please check your API key settings and try again.');
    } else if (errorMessage.includes('quota')) {
      throw new Error('API quota exceeded. Please try again later or update your API key in settings.');
    } else {
      throw new Error(`Failed to generate referral message: ${errorMessage}`);
    }
  }
}

/**
 * Creates the AI prompt from the template
 */
function createPrompt(
  jobTitle: string,
  companyName: string,
  jobDescription: string,
  template: string
): string {
  return `
You are tasked with creating a professional and personalized referral request message.

JOB POSTING DETAILS:
---
Company: ${companyName}
Job Title: ${jobTitle}
Job Description:
${jobDescription}
---

TEMPLATE:
${template}

INSTRUCTIONS:
1. Analyze the job description and identify key skills or qualifications needed for this position.
2. Create a professionally-worded message following the provided template.
3. Replace {jobTitle} with "${jobTitle}", {companyName} with "${companyName}", and {skills} with 3 of the most relevant skills from the job description.
4. Keep the structure and format of the template, only replacing the placeholder variables.
5. DO NOT mention "HireJobs" or any job board website in your message.
6. Keep any existing formatting and structure from the template.
`;
}

/**
 * Retrieves the active template for the given user ID
 * @param userId Optional user ID
 * @returns Template content as string
 */
async function getActiveTemplate(userId?: string): Promise<string> {
  let template;
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    template = await Template.findOne({
      userId,
      isDefault: true
    });
  }
  if (!template) {
    template = await Template.findOne({
      userId: { $exists: false },
      isDefault: true
    });
  }

  if (!template) {
    return `
Applying for {jobTitle} at {companyName}

Hey [RECIPIENT],

I'm a skilled developer with expertise in {skills}, and I'm reaching out about the {jobTitle} role at {companyName} ([JOB POST LINK]). Given your connection to the company, I wanted to ask if you would consider helping me with a referral.

Work that I am most proud of:
- Developed a comprehensive dashboard application for performance monitoring
- Built a user-friendly web application with modern frontend technologies
- Contributed to open-source projects focused on developer productivity

Beyond professional experience, I've created several personal projects which demonstrate my abilities and passion for technology.

My resume and portfolio provide further details about my experience and skills.

Your time and consideration would mean a lot to me. Would you be open to referring me for this position?

Thank you,
[YOUR NAME]
    `;
  }
  
  return template.content;
}


/**
 * Extracts structured job details from raw job posting text using Gemini AI
 * 
 * @param jobContent Raw job posting text
 * @param userId Optional user ID to use their stored API key
 * @returns JobData object with extracted title, company, and description
 * @throws Error if extraction fails
 */
export async function extractJobDetailsFromContent(
  jobContent: string,
  userId?: string
): Promise<JobData> {
  logger.info(`Extracting job details from raw content${userId ? ` (user: ${userId})` : ''}`);
  
  const contentPreview = jobContent.slice(0, 1000);
  const contentHash = hashString(contentPreview);
  const cacheKey = `extract:${userId || 'anon'}:${contentHash}`;
  
  const cachedResult = messageCache.get<JobData>(cacheKey);
  if (cachedResult) {
    logger.info(`Cache hit for job content extraction`);
    return cachedResult;
  }
  
  const apiKey = await getUserApiKey(userId);
  
  if (!apiKey) {
    throw new Error('No Gemini API key available. Please add an API key in your account settings.');
  }
  
  const client = initGeminiClient(apiKey);
  
  const prompt = createExtractionPrompt(jobContent);
  const modelName = 'gemini-1.5-flash';
  
  try {
    logger.info(`Using model: ${modelName} for job detail extraction`);
    
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.2,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    });
    
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    try {
      const parsedResult = parseAIResponse(text);
      
      if (!parsedResult.title || parsedResult.title.length < 3) {
        throw new Error('Could not extract valid job title');
      }
      
      if (!parsedResult.company || parsedResult.company.length < 2) {
        throw new Error('Could not extract valid company name');
      }
      
      if (!parsedResult.description || parsedResult.description.length < 100) {
        throw new Error('Could not extract sufficient job description');
      }
      
      const jobData: JobData = {
        title: parsedResult.title.replace(/hirejobs/gi, '').trim(),
        company: parsedResult.company.replace(/hirejobs/gi, '').trim(),
        description: parsedResult.description
      };
      
      messageCache.set(cacheKey, jobData);
      
      logger.info(`Successfully extracted job details: ${jobData.title} at ${jobData.company}`);
      return jobData;
    } catch (parseError) {
      logger.error(`Error parsing AI response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      throw new Error('Failed to extract structured job data from content');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error with model ${modelName} during extraction: ${errorMessage}`);
    
    if (errorMessage.includes('API key not valid')) {
      throw new Error('The API key is not valid. Please check your API key settings and try again.');
    } else if (errorMessage.includes('quota')) {
      throw new Error('API quota exceeded. Please try again later or update your API key in settings.');
    } else {
      throw new Error(`Failed to extract job details: ${errorMessage}`);
    }
  }
}

/**
 * Creates a prompt for the AI to extract job details
 */
function createExtractionPrompt(jobContent: string): string {
  return `
You are a specialized AI assistant tasked with extracting structured information from job postings.

JOB POSTING CONTENT:
---
${jobContent}
---

INSTRUCTIONS:
1. Extract the job title, company name, and a comprehensive job description from the provided content.
2. Format your response as a structured JSON object with keys: "title", "company", and "description".
3. For the description, include all important details from the job posting, including responsibilities, requirements, qualifications, benefits, etc.
4. Ensure the description is comprehensive and well-structured with proper paragraphs.
5. Remove any references to job boards like "HireJobs" from all fields.
6. Make sure to capture the skills, requirements, and responsibilities accurately.

RESPONSE FORMAT:
{
  "title": "The extracted job title",
  "company": "The company name",
  "description": "A comprehensive, well-structured description that includes all important details from the job posting"
}

Only provide the JSON object as your response, nothing else before or after.
`;
}

/**
 * Parses the AI response to extract structured job data
 */
function parseAIResponse(aiResponse: string): JobData {
  const jsonStr = aiResponse
    .replace(/^```json/i, '')
    .replace(/```$/i, '')
    .trim();
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    return {
      title: parsed.title || '',
      company: parsed.company || '',
      description: parsed.description || ''
    };
  } catch (error) {
    logger.error(`JSON parsing error: ${error instanceof Error ? error.message : String(error)}`);
    
    const titleMatch = aiResponse.match(/title["\s:]+([^"]+)/i);
    const companyMatch = aiResponse.match(/company["\s:]+([^"]+)/i);
    const descriptionMatch = aiResponse.match(/description["\s:]+([^"]+)/i);
    
    return {
      title: titleMatch ? titleMatch[1].trim() : '',
      company: companyMatch ? companyMatch[1].trim() : '',
      description: descriptionMatch ? descriptionMatch[1].trim() : ''
    };
  }
}