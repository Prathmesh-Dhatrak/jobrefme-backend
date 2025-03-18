import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { 
  setGeminiApiKey, 
  deleteGeminiApiKey, 
  verifyGeminiApiKey 
} from '../controllers/apiKeyController';

const router = Router();

// All routes require authentication
router.use(protect);

// Gemini API key management routes
router.post('/gemini-key', setGeminiApiKey);
router.get('/gemini-key/verify', verifyGeminiApiKey);
router.delete('/gemini-key', deleteGeminiApiKey);

export default router;