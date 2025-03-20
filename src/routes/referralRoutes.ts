import { Router } from 'express';
import { generateReferral, getGeneratedReferral, clearReferralCache } from '../controllers/referralController';
import { validateJobUrlRequest, validateClearCacheRequest } from '../utils/validators';
import { validateUrlStatus } from '../controllers/urlController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

router.post('/validate-job-url', protect, validateJobUrlRequest, validateUrlStatus);
router.post('/generate-referral', protect, validateJobUrlRequest, generateReferral);
router.post('/generate-referral/result', protect, validateJobUrlRequest, getGeneratedReferral);
router.post('/clear-cache', protect, validateClearCacheRequest, clearReferralCache);

export default router;