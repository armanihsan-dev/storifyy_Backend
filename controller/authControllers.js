import OTP from "../models/otpModel.js";
import { sendOtpService } from "../services/sendOtp.js";
import verifyGoogleIDToken from '../services/googleIDTokenVerification.js'
import User from './../models/userModel.js';
import Directory from './../models/directoryModel.js';
import mongoose, { Types } from "mongoose";
import Session from './../models/sessionModel.js';

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

        const { email, otp } = req.body
        if (!email || !otp) {
            return res.status(400).json({ error: "Email and OTP are required" });
        }
        // Here you would typically verify the OTP against a stored value
        const otpRecord = await OTP.findOne({ email })

        if (!otpRecord) {
            return res.status(400).json({ error: "No OTP found for this email" });
        }
        if (otpRecord.otp == otp) {
            await otpRecord.deleteOne()
            return res.status(200).json({ message: "OTP verified successfully" });
        }
    } catch (error) {
        next(error)
    }
}

export const loginWithGoogle = async (req, res, next) => {
    const { id_token } = req.body;

    try {
        const { sub, name, email, picture } = await verifyGoogleIDToken(id_token);

        let existingUser = await User.findOne({ email });


        if (existingUser) {
            if (existingUser.deleted) {
                return res.status(403).json({ message: "This account has been deleted. Please contact with admin to recover it." });
            }
            // USER EXISTS → create session directly
            const sessions = await Session.find({ userId: existingUser._id });

            if (sessions.length >= 2) {
                await sessions[0].deleteOne();
            }

            const session = await Session.create({ userId: existingUser._id });
            if (!existingUser.picture.includes('googleusercontent.com')) {
                existingUser.picture = picture
                await existingUser.save()
            }
            res.cookie('sid', session.id, {
                httpOnly: true,
                signed: true,
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });
            return res.status(200).json({ message: "Logged in existing user" });
        }

        // NEW USER FLOW
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const userId = new Types.ObjectId();
            const rootId = new Types.ObjectId();

            await Directory.create([{
                _id: rootId,
                name: `root-${email}`,
                parentDirId: null,
                userId
            }], { session });

            await User.create([{
                _id: userId,
                name,
                email,
                picture,
                rootDirId: rootId
            }], { session });

            await session.commitTransaction();
            session.endSession();

            // CREATE SESSION AFTER COMMIT
            const userSession = await Session.create({ userId });

            res.cookie('sid', userSession.id, {
                httpOnly: true,
                signed: true,
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            res.status(201).json({ message: "Created new user and logged in" });

        } catch (err) {
            await session.abortTransaction();
            session.endSession();
            next(err);
        }

    } catch (err) {
        next(err);
    }
};


