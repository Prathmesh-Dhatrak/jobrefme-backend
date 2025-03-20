import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Template from '../models/templateModel';
import { logger } from '../utils/logger';

const defaultTemplate = `
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

async function createSystemDefaultTemplate() {
    try {
      const mongoURI = process.env.MONGODB_URI;
      if (!mongoURI) {
        throw new Error('MONGODB_URI environment variable is not defined');
      }
  
      await mongoose.connect(mongoURI);
      logger.info('Connected to MongoDB Atlas successfully');
  
      const existingTemplate = await Template.findOne({ 
        userId: { $exists: false },
        isDefault: true 
      });
  
      if (existingTemplate) {
        logger.info('System default template already exists, updating content');
        existingTemplate.content = defaultTemplate;
        await existingTemplate.save();
        logger.info('System default template updated successfully');
      } else {
        logger.info('Creating new system default template');
        await Template.create({
          name: 'System Default Template',
          content: defaultTemplate,
          isDefault: true
        });
        logger.info('System default template created successfully');
      }
  
      await mongoose.connection.close();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
  
  createSystemDefaultTemplate();