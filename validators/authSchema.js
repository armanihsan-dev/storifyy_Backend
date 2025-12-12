import { z } from 'zod/v4'
const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const passMessage = "Please choose a stronger password"


// 👉 Reusable fields
const emailField = z.string().regex(emailRegex, "Invalid email");
const passwordField = z.string().min(8, "Password must be at least 8 characters long").regex(passRegex, passMessage);
const otpField = z.string().length(4, "OTP must be exactly 4 digits");

export const registerSchema = z.object({
    name: z.string().min(3).max(30),
    email: emailField,
    password: passwordField,
    otp: otpField
});

export const loginSchema = z.object({
    email: emailField,
    password: passwordField
});

export const OTPSchema = z.object({
    email: emailField,
    otp: otpField
});

export const emailSchema = z.object({
    email: emailField
})