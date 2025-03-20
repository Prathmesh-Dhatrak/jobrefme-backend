import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';
import NodeCache from 'node-cache';
import User from '../models/userModel';
import Template from '../models/templateModel';
import mongoose from 'mongoose';

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