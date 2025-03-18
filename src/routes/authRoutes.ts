import { Router } from 'express';
import { login, logout, getProfile, startGoogleAuth, googleAuthCallback } from '../controllers/authController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

// Google OAuth routes
router.get('/google', startGoogleAuth);
router.get('/google/callback', googleAuthCallback);

// Other auth routes
router.get('/login', login);
router.get('/logout', logout);
router.get('/profile', protect, getProfile);

export default router;