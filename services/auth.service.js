import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import Directory from '../models/directoryModel.js';
import OTP from '../models/otpModel.js';
import User from "../models/userModel.js";
import redisClient from "../config/redis.js";
import crypto from "crypto";

export const registerUser = async ({ name, email, password, otp }) => {
    
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 1. Verify OTP
        const otpRecord = await OTP.findOne({ email, otp }).lean();
        if (!otpRecord) {
            throw new Error("Invalid OTP", 400);
        }
        //find if users with emai already exists

        // 2. Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // IDs
        const userId = new mongoose.Types.ObjectId();
        const rootDirId = new mongoose.Types.ObjectId();

        // 3. Create root directory
        await Directory.create([{
            _id: rootDirId,
            name: `root-${email}`,
            parentDirId: null,
            userId
        }], { session });

        // 4. Create user
        await User.create([{
            _id: userId,
            name,
            email,
            password: hashedPassword,
            rootDirId
        }], { session });

        await session.commitTransaction();
    } catch (err) {
        await session.abortTransaction();
        throw err; // Controller + error middleware handles
    }
};

export const loginUser = async (email, password) => {
    // 1. Find user
    const user = await User.findOne({ email });
    if (!user) {
        throw new AppError("Invalid Credentials", 404);
    }

    // 2. Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
        throw new AppError("Invalid Credentials", 404);
    }

    // 3. Enforce 1 active session policy
    const allSessions = await redisClient.ft.search(
        'userIdIdx',
        `@userId:{${user._id}}`,
        { RETURN: [] }
    );

    if (allSessions.total >= 1) {
        await redisClient.del(allSessions.documents[0].id);
    }

    // 4. Create new session
    const sessionId = crypto.randomUUID();
    const redisKey = `session:${sessionId}`;

    await redisClient.json.set(redisKey, '$', { userId: user._id });

    // 5. Session expiry: 7 days
    const sessionExpiryTime = 1000 * 60 * 60 * 24 * 7;
    await redisClient.expire(redisKey, sessionExpiryTime / 1000);

    // 6. Return to controller
    return { sessionId, sessionExpiryTime };
};
