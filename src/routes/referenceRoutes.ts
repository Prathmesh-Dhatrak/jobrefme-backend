import { Router } from 'express';
import { generateReference, getGeneratedReference } from '../controllers/referenceController';
import { validateJobUrlRequest } from '../utils/validators';
import { validateUrlStatus } from '../controllers/urlController';

const router = Router();

router.post('/url/validate', validateJobUrlRequest, validateUrlStatus);

router.post('/reference', validateJobUrlRequest, generateReference);

router.post('/reference/result', validateJobUrlRequest, getGeneratedReference);

export default router;