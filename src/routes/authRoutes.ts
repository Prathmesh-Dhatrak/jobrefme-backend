import { Router } from 'express';
import { 
  googleLogin, 
  googleCallback, 
  getCurrentUser, 
  storeApiKey, 
  checkApiKey,
  deleteApiKey 
} from '../controllers/authController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

// Google OAuth routes
router.get('/google', googleLogin);
router.get('/google/callback', googleCallback);

// Protected routes
router.get('/me', authenticate, getCurrentUser);

// API key management routes
router.post('/api-key', authenticate, storeApiKey);
router.get('/api-key', authenticate, checkApiKey);
router.delete('/api-key', authenticate, deleteApiKey);

export default router;