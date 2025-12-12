import User from './../models/userModel.js';
import mongoose from "mongoose";
import Directory from './../models/directoryModel.js';
import Session from './../models/sessionModel.js';
import File from './../models/fileModel.js';
import { loginUser, registerUser } from './../services/auth.service.js';
import OTP from '../models/otpModel.js';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import redisClient from '../config/redis.js';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

export const ROLE_HIERARCHY = ["User", "Manager", "Admin", "Owner"];

export const register = async (req, res, next) => {
    try {
        const { name, email, password, otp } = req.body

        // Call service → contains hashing, OTP check, DB transaction
        const existingUser = await User.findOne({ email }).lean()
        if (existingUser) {
            return res.status(409).json({ error: "User with this email already exists" })
        }
        await registerUser({ name, email, password, otp });
        const otpRecord = await OTP.findOne({ email, otp });
        if (otpRecord) {
            await otpRecord.deleteOne()
        }
        res.status(201).json({ message: "User registered successfully" });
    } catch (err) {
        next(err); // Central error handler will catch
    }
};

export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body

        // Call service → does all business logic
        const { sessionId, sessionExpiryTime } = await loginUser(email, password);

        // Set cookie here (controller responsibility)
        res.cookie('sid', sessionId, {
            httpOnly: true,
            signed: true,
            sameSite: 'lax',
            maxAge: sessionExpiryTime
        });

        res.json({ message: "Logged in successfully" });
    } catch (err) {
        next(err);
    }
};

export const getAllUsers = async (req, res) => {
    try {
        let query = {};
        const sessionId = req.signedCookies.sid;
        const redisKey = `session:${sessionId}`;

        // Owner can see all users including deleted

        if (req.user.role === "Owner") {
            query = { includeDeleted: true };
        } else {
            query = { deleted: false };
        }

        const users = await User.find(query)
            .select("-password -refreshToken -rootDirId -__v")
            .lean();

        const usersWithStatus = await Promise.all(
            users.map(async (user) => {
                const session = await redisClient.json.get(redisKey);
                return {
                    ...user,
                    status: session ? "Logged-In" : "Logged-Out",
                };
            })
        );

        res.status(200).json({
            success: true,
            count: usersWithStatus.length,
            data: usersWithStatus,
        });

    } catch (err) {
        console.error("Get Users Error:", err);
        res.status(500).json({
            success: false,
            error: "Internal Server Error",
        });
    }
};


export const logoutUserById = async (req, res) => {
    try {
        const { userId } = req.params;

        // 1. Find target user
        const targetUser = await User.findById(userId).lean();
        if (!targetUser) {
            return res.status(404).json({ error: "Target user not found" });
        }

        const actingRole = req.user.role;
        const targetRole = targetUser.role;


        // You can add "SuperAdmin" later with higher rank.

        const actingRank = ROLE_HIERARCHY.indexOf(actingRole);
        const targetRank = ROLE_HIERARCHY.indexOf(targetRole);

        // 3. If acting user is lower rank → forbidden
        if (actingRank < 0 || targetRank < 0) {
            return res.status(500).json({ error: "Role configuration error" });
        }

        if (actingRank < targetRank && actingRole !== "Admin") {
            return res.status(403).json({
                success: false,
                message: `Forbidden: A ${actingRole} cannot logout a ${targetRole}.`
            });
        }

        // 4. Allowed → delete sessions
        await Session.deleteMany({ userId });

        return res.status(200).json({
            success: true,
            message: `${targetUser.name} has been logged out successfully.`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: "Server error" });
    }
};


export const softDeleteUser = async (req, res) => {
    const { userid } = req.params;
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        // 1️Check user exists
        const user = await User.findById(userid).session(session);

        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({ message: "User not found" });
        }

        // 2️ Prevent self-delete
        if (user._id.toString() === req.user._id.toString()) {
            await session.abortTransaction();
            return res.status(403).json({ message: "User cannot delete themselves" });
        }

        await Session.deleteMany({ userId: userid }).session(session),
            await User.findByIdAndUpdate(userid, { deleted: true }, { session })
        // Commit
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            message: "User delted soft.",
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({ error: error.message });
    }
}


export const hardDeleteUser = async (req, res) => {
    const { userid } = req.params;
    const session = await mongoose.startSession();

    try {
        session.startTransaction();

        // 1️Check user exists
        const user = await User.findById(userid).session(session);

        if (!user) {
            await session.abortTransaction();
            return res.status(404).json({ message: "User not found" });
        }

        // 2️ Prevent self-delete
        if (user._id.toString() === req.user._id.toString()) {
            await session.abortTransaction();
            return res.status(403).json({ message: "User cannot delete themselves" });
        }

        //  Perform all deletes in parallel (MUCH FASTER)
        await Promise.all([
            User.deleteOne({ _id: userid }, { session }),
            File.deleteMany({ userId: userid }).session(session),
            Directory.deleteMany({ userId: userid }).session(session),
            Session.deleteMany({ userId: userid }).session(session),
        ]);
        // Commit
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            message: "User and related data deleted successfully.",
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({ error: error.message });
    }


}

export const changeRole = async (req, res) => {
    const { userId, newRole } = req.body;

    try {
        // ---- Validate Input Early ----
        if (!userId || !newRole) {
            return res.status(400).json({ error: "userId and newRole are required." });
        }

        if (!ROLE_HIERARCHY.includes(newRole)) {
            return res.status(400).json({ error: "Invalid role provided." });
        }

        // ---- Fetch Target User ----
        const targetUser = await User.findById(userId).lean();
        if (!targetUser) {
            return res.status(404).json({ error: "Target user not found." });
        }


        // Ranking
        const actingRole = req.user.role;
        const targetRole = targetUser.role;

        const actingRank = ROLE_HIERARCHY.indexOf(actingRole);
        const targetRank = ROLE_HIERARCHY.indexOf(targetRole);
        const targetingRole = ROLE_HIERARCHY.indexOf(newRole)

        // ---- Permission Check ----
        if (actingRank < targetRank) {
            return res.status(403).json({
                error: `Forbidden: A ${actingRole} cannot change the role of a ${targetRole}.`
            });
        }

        //Prevent a role to give a role higher then his own role
        if (targetingRole > actingRank) {
            return res.status(403).json({
                error: `Forbidden: You cannot assign a role higher than your own.`
            })
        }
        // ---- Prevent Self Role Change (Optional) ----
        if (req.user._id.toString() === userId.toString()) {
            return res.status(400).json({
                error: "You cannot change your own role."
            });
        }

        // ---- Update Only if Role is Actually Different ----
        if (targetRole === newRole) {
            return res.status(200).json({
                message: "No changes required. User already has this role."
            });
        }

        // ---- Update Role ----
        await User.findByIdAndUpdate(
            userId,
            { role: newRole },
            { new: true, runValidators: true }
        );

        res.status(200).json({ message: "User role updated successfully." });

    } catch (err) {
        console.error("Role change error:", err);
        res.status(500).json({
            error: "Internal server error while updating user role."
        });
    }
}

export const recoverUser = async (req, res) => {
    const userId = req.params.userid
    try {
        if (req.user.role !== 'Owner') {
            return res.status(403).json({ error: "You can't recover users." })
        }
        const targerUser = await User.updateOne({ _id: userId }, { deleted: false })
        res.status(200).json({ message: "User recovered successfully." })

    } catch (err) {
        res.status(500).json({ error: "Internal Server Error" })
    }
}