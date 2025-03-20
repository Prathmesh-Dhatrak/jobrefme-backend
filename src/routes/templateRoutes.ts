import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getDefaultTemplate
} from '../controllers/templateController';

const router = Router();

router.use(protect);

router.route('/templates')
  .get(getTemplates)
  .post(createTemplate);

router.route('/templates/default')
  .get(getDefaultTemplate);

router.route('/templates/:id')
  .get(getTemplateById)
  .put(updateTemplate)
  .delete(deleteTemplate);

export default router;