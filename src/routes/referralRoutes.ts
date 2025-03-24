import { Router } from 'express';
import { 
  generateReferral, 
  getGeneratedReferral, 
  clearReferralCache,
  processRawJobContent
} from '../controllers/referralController';
import { validateJobUrlRequest, validateClearCacheRequest, validateJobContentRequest } from '../utils/validators';
import { validateUrlStatus } from '../controllers/urlController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

router.post('/validate-job-url', protect, validateJobUrlRequest, validateUrlStatus);
router.post('/generate-referral', protect, validateJobUrlRequest, generateReferral);
router.post('/generate-referral/result', protect, validateJobUrlRequest, getGeneratedReferral);
router.post('/clear-cache', protect, validateClearCacheRequest, clearReferralCache);

router.post('/generate-referral/content', protect, validateJobContentRequest, processRawJobContent);

export default router;