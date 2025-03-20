import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/errorHandler';
import Template from '../models/templateModel';

/**
 * Get all templates for the authenticated user
 */
export async function getTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized');
    }

    const userId = req.user._id;
    logger.info(`Fetching all templates for user: ${userId}`);
    
    const templates = await Template.find({
      $or: [
        { userId },
        { userId: { $exists: false } }
      ]
    }).sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates
    });
  } catch (error) {
    logger.error(`Error fetching templates: ${error}`);
    next(error);
  }
}

/**
 * Get a single template by ID
 */
export async function getTemplateById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized');
    }

    const userId = req.user._id;
    const templateId = req.params.id;
    
    const template = await Template.findOne({
      _id: templateId,
      $or: [
        { userId },
        { userId: { $exists: false } }
      ]
    });

    if (!template) {
      throw new ApiError(404, 'Template not found');
    }

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new template
 */
export async function createTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized');
    }

    const { name, content, isDefault } = req.body;
    
    if (!name || !content) {
      throw new ApiError(400, 'Name and content are required');
    }
    
    logger.info(`Creating new template "${name}" for user: ${req.user._id}`);
    
    if (isDefault) {
      logger.info(`Setting as default template and removing existing defaults for user: ${req.user._id}`);
      await Template.updateMany(
        { userId: req.user._id, isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    const template = await Template.create({
      name,
      content,
      isDefault: !!isDefault,
      userId: req.user._id
    });

    res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'MongoError' && (error as any).code === 11000) {
      logger.warn(`Duplicate default template attempt by user: ${req.user?._id}`);
      return next(new ApiError(400, 'You already have a default template. Please update the existing one or unset it as default first.'));
    }
    logger.error(`Error creating template: ${error}`);
    next(error);
  }
}

/**
 * Update an existing template
 */
export async function updateTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized');
    }

    const { name, content, isDefault } = req.body;
    const templateId = req.params.id;
    
    logger.info(`Updating template ${templateId} for user: ${req.user._id}`);
    
    const template = await Template.findOne({
      _id: templateId,
      userId: req.user._id
    });

    if (!template) {
      throw new ApiError(404, 'Template not found or you do not have permission to update it');
    }

    if (isDefault && !template.isDefault) {
      logger.info(`Setting template ${templateId} as default and removing existing defaults`);
      await Template.updateMany(
        { userId: req.user._id, isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    if (name) template.name = name;
    if (content) template.content = content;
    if (isDefault !== undefined) template.isDefault = isDefault;

    await template.save();

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'MongoError' && (error as any).code === 11000) {
      logger.warn(`Duplicate default template update attempt by user: ${req.user?._id}`);
      return next(new ApiError(400, 'You already have a default template. Please update the existing one or unset it as default first.'));
    }
    logger.error(`Error updating template: ${error}`);
    next(error);
  }
}

/**
 * Delete a template
 */
export async function deleteTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized');
    }

    const templateId = req.params.id;
    logger.info(`Deleting template ${templateId} for user: ${req.user._id}`);
    
    const template = await Template.findOne({
      _id: templateId,
      userId: req.user._id
    });

    if (!template) {
      throw new ApiError(404, 'Template not found or you do not have permission to delete it');
    }

    await template.deleteOne();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    logger.error(`Error deleting template: ${error}`);
    next(error);
  }
}

/**
 * Get default template for the authenticated user
 */
export async function getDefaultTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized');
    }

    const userId = req.user._id;
    
    let template = await Template.findOne({
      userId,
      isDefault: true
    });

    if (!template) {
      template = await Template.findOne({
        userId: { $exists: false },
        isDefault: true
      });
    }

    if (!template) {
      throw new ApiError(404, 'No default template found');
    }

    res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    next(error);
  }
}