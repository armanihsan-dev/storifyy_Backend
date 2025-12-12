import express from 'express'
const router = express.Router();
import { loginWithGoogle, sendOtp, verifyOtp } from './../controller/authControllers.js';
import { validateEmail, validateOTP } from '../middlewares/validate.js';
import { emailSchema, OTPSchema } from '../validators/authSchema.js';

router.post('/send-otp', validateEmail(emailSchema),sendOtp)

router.post('/verify-otp', validateOTP(OTPSchema), verifyOtp)
router.post('/google', loginWithGoogle)


export default router