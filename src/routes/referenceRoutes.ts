import { Router } from 'express';
import { generateReference } from '../controllers/referenceController';
import { validateJobUrlRequest } from '../utils/validators';

const router = Router();

router.post('/reference', validateJobUrlRequest, generateReference);

export default router;