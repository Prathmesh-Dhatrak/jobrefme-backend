import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';
import NodeCache from 'node-cache';

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
function generateCacheKey(jobTitle: string, companyName: string, descriptionHash: string): string {
  return `${jobTitle.toLowerCase().trim()}:${companyName.toLowerCase().trim()}:${descriptionHash}`;
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
 * Generates a referral request message using Google Gemini API
 * with caching to avoid redundant API calls
 * 
 * @param jobTitle The job title
 * @param companyName The company name
 * @param jobDescription The job description
 * @param userApiKey Optional user-provided API key
 * @returns Generated referral message
 * @throws Error if generation fails
 */
export async function generateReferralMessage(
  jobTitle: string,
  companyName: string,
  jobDescription: string,
  userApiKey?: string
): Promise<string> {
  const descriptionPreview = jobDescription.slice(0, 1000);
  const descriptionHash = hashString(descriptionPreview);

  const isUsingCustomKey = userApiKey && userApiKey.trim().length > 0;
  const cacheKey = isUsingCustomKey
    ? `custom:${generateCacheKey(jobTitle, companyName, descriptionHash)}`
    : generateCacheKey(jobTitle, companyName, descriptionHash);

  const cachedMessage = messageCache.get<string>(cacheKey);
  if (cachedMessage) {
    logger.info(`Cache hit for: ${jobTitle} at ${companyName}`);
    return cachedMessage;
  }

  logger.info(`Generating referral message for ${jobTitle} at ${companyName}`);

  const apiKey = userApiKey?.trim() || defaultApiKey;

  if (!apiKey) {
    throw new Error('No Gemini API key available. Please provide a valid API key.');
  }

  const client = initGeminiClient(apiKey);

  const prompt = createPrompt(jobTitle, companyName, jobDescription);
  const modelName = 'gemini-1.5-flash';

  try {
    logger.info(`Using model: ${modelName} with ${isUsingCustomKey ? 'user-provided' : 'default'} API key`);

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
      throw new Error('The provided API key is not valid. Please check your API key and try again.');
    } else if (errorMessage.includes('quota')) {
      throw new Error('API quota exceeded. Please try again later or use a different API key.');
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
    jobDescription: string
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

INSTRUCTIONS:
1. Analyze the job description and identify key skills or qualifications needed for this position.
2. Create a professionally-worded message in EXACTLY the following format:

Applying for ${jobTitle} at ${companyName}

Hey [RECIPIENT],

I'm Prathmesh Dhatrak, a fullstack developer with expertise in [REPLACE WITH 3 RELEVANT SKILLS FROM JOB DESCRIPTION], and I'm reaching out about the ${jobTitle} role at ${companyName} ([JOB POST LINK]). Given your connection to the company, I wanted to ask if you would consider helping me with a referral.

Work that I am most proud of:
- At Copods, I built a comprehensive Candidate Evaluation and HR dashboard
- InVideo (https://tinyurl.com/pd-ivsr): Engineered a user-friendly screen recording web app with React, TypeScript, and Rust-WASM, optimized with serverless AWS architecture

Beyond professional experience, I've created engaging personal projects (Cinemagram, Friend-Zone) which are all deployed and available to view.

My resume and portfolio provide further details:
Resume: https://tinyurl.com/pd-ivrs
Portfolio: prathmeshdhatrak.com

Your time and consideration would mean a lot to me. Would you be open to referring me for this position?

Thank you,
Prathmesh Dhatrak

3. IMPORTANT: The only part you should modify is the "[REPLACE WITH 3 RELEVANT SKILLS FROM JOB DESCRIPTION]" section, where you should list 3 key skills or technologies mentioned in the job description.
4. DO NOT change any other placeholders or text in the template.
5. DO NOT mention "HireJobs" or any job board website in your message.

FORMAT YOUR RESPONSE EXACTLY AS THE TEMPLATE ABOVE WITH ONLY THE SKILLS SECTION CUSTOMIZED.
  `;
  }