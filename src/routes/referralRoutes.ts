import { Router } from 'express';
import { generateReferral, getGeneratedReferral, clearReferralCache } from '../controllers/referralController';
import { validateJobUrlRequest, validateClearCacheRequest } from '../utils/validators';
import { validateUrlStatus } from '../controllers/urlController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

router.use(protect);

router.post('/validate-job-url', validateJobUrlRequest, validateUrlStatus);

router.post('/generate-referral', validateJobUrlRequest, generateReferral);

router.post('/generate-referral/result', validateJobUrlRequest, getGeneratedReferral);

router.post('/clear-cache', validateClearCacheRequest, clearReferralCache);

export default router;