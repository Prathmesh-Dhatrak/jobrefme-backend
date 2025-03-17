import { Router } from 'express';
import { generateReferral, getGeneratedReferral, clearReferralCache } from '../controllers/referralController';
import { validateJobUrlRequest } from '../utils/validators';
import { validateUrlStatus } from '../controllers/urlController';

const router = Router();

router.post('/validate-job-url', validateJobUrlRequest, validateUrlStatus);

router.post('/generate-referral', validateJobUrlRequest, generateReferral);

router.post('/generate-referral/result', validateJobUrlRequest, getGeneratedReferral);

router.post('/clear-cache', validateJobUrlRequest, clearReferralCache);

export default router;