import express from 'express'
const router = express.Router();
import { loginWithGoogle, sendOtp, verifyOtp } from './../controller/authControllers.js';

router.post('/send-otp', sendOtp)

router.post('/verify-otp', verifyOtp)
router.post('/google', loginWithGoogle)


export default router