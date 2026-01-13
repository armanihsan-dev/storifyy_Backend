import { sendOtpService } from "../services/sendOtp.js";
import verifyGoogleIDToken from '../services/googleIDTokenVerification.js'
import User from './../models/userModel.js';
import Directory from './../models/directoryModel.js';
import mongoose, { Types } from "mongoose";
import redisClient from "../config/redis.js";
import OTP from "../models/otpModel.js";

export const sendOtp = async (req, res, next) => {
    try {
        const { email } = req.body

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        // Call the OTP sender utility
        const result = await sendOtpService(email);
        if (result.success) {
            return res.status(200).json({ message: result.message });
        } else {
            return res.status(500).json({ error: result.message });
        }
    } catch (error) {
        next(error)
    }
}

export const verifyOtp = async (req, res, next) => {
    try {
        const { email, otp } = req.body;

        const otpRecord = await OTP.findOne({ email });

        if (!otpRecord) {
            return res.status(400).json({ error: "OTP not found or expired" })
        }

        if (otpRecord.otp !== otp) {
            return res.status(400).json({ error: "Wrong OTP !!" })
        }
        res.status(200).json({ message: "OTP verified successfully" });
    } catch (err) {
        next(err);
    }
};

export const loginWithGoogle = async (req, res, next) => {
    const { id_token } = req.body;

    try {
        const { sub, name, email, picture } = await verifyGoogleIDToken(id_token);

        let existingUser = await User.findOne({ email });


        // EXISTING USER FLOW
        if (existingUser) {

            if (existingUser.deleted) {
                return res.status(403).json({ message: "This account has been deleted. Please contact with admin to recover it." });
            }

            const sessions = await redisClient.ft.search('userIdIdx', `@userId:{${existingUser._id}}`, { RETURN: [] })

            if (sessions.total >= 2) {
                await redisClient.del(sessions.documents[0].id)
            }

            const sessionId = crypto.randomUUID()
            const redisKey = `session:${sessionId}`

            const redisSession = await redisClient.json.set(redisKey, '$', { userId: existingUser._id })

            const sessionExpiryTime = 7 * 24 * 60 * 60 // seconds
            redisClient.expire(redisKey, sessionExpiryTime)

            if (!existingUser.picture.includes('googleusercontent.com')) {
                existingUser.picture = picture
                await existingUser.save()
            }

            res.cookie('sid', sessionId, {
                httpOnly: true,
                signed: true,
                maxAge: sessionExpiryTime * 1000,
                sameSite: 'lax'
            });

            return res.status(200).json({ message: "Logged in existing user" });
        }


        // NEW USER FLOW
        const mongoSession = await mongoose.startSession();
        mongoSession.startTransaction();

        try {
            const userId = new Types.ObjectId();
            const rootId = new Types.ObjectId();

            await Directory.create([{
                _id: rootId,
                name: `root-${email}`,
                parentDirId: null,
                userId
            }], { session: mongoSession });

            await User.create([{
                _id: userId,
                name,
                email,
                picture,
                rootDirId: rootId
            }], { session: mongoSession });

            await mongoSession.commitTransaction();
            mongoSession.endSession();

            // CREATE REDIS SESSION
            const sessionId = crypto.randomUUID()
            const redisKey = `session:${sessionId}`

            const redisSession = await redisClient.json.set(redisKey, '$', { userId })

            const sessionExpiryTime = 7 * 24 * 60 * 60 // seconds
            redisClient.expire(redisKey, sessionExpiryTime)

            res.cookie('sid', sessionId, {
                httpOnly: true,
                signed: true,
                sameSite: 'lax',
                maxAge: sessionExpiryTime * 1000
            });

            return res.status(201).json({ message: "Created new user and logged in" });

        } catch (err) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            next(err);
        }


    } catch (err) {
        next(err);
    }
};


