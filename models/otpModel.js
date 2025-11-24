import mongoose, { Schema } from 'mongoose'

const otpSchema = new Schema({

    email: {
        type: String,
        unique: true,
        required: true
    },
    otp: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600// 1 hour
    }
})

const OTP = mongoose.model('OTP', otpSchema)
export default OTP