import express from 'express'
import User from '../models/userModel.js';
import Subscription from '../models/SubscriptionModel.js';
import { pauseSubscriptionInLemonSqueezy, unpauseSubscriptionInLemonSqueezy, cancelLemonSubscription } from '../validators/LemonSqueezyFunctions.js'
import redisClient from '../config/redis.js';
import Directory from './../models/directoryModel.js';
import File from './../models/fileModel.js';
import Share from './../models/shareModel_tmp.js';
import DirectoryShare from './../models/directoryShareModel.js';
const router = express.Router();
import mongoose from 'mongoose';
import { deleteS3Object } from '../config/s3.js';


async function removeRedisSession(req, res) {
    const { sid } = req.signedCookies
    const redisKey = `session:${sid}`
    await redisClient.del(redisKey)
    res.clearCookie('sid')
}

router.post('/delete', async (req, res, next) => {
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const session = await mongoose.startSession();

        try {
            if (!req.user) {
                return res.status(401).json({ message: 'Unauthorized' });
            }

            const userId = req.user._id;
            const userEmail = req.user.email;

            const files = await File.find({ userId }).lean();
            const subscription = await Subscription.findOne({ userId }).lean();

            if (subscription?.LemonSqueezySubscriptionId) {
                await cancelLemonSubscription(
                    subscription.LemonSqueezySubscriptionId
                );
            }

            session.startTransaction();

            await User.deleteOne({ _id: userId }).session(session);
            await Directory.deleteMany({ userId }).session(session);
            await File.deleteMany({ userId }).session(session);
            await Subscription.deleteOne({ userId }).session(session);

            await Share.deleteMany({ sharedBy: userId }).session(session);
            await DirectoryShare.deleteMany({ sharedBy: userId }).session(session);

            await Share.deleteMany({ userId, email: userEmail }).session(session);
            await DirectoryShare.deleteMany({
                sharedUserId: userId,
                sharedUserEmail: userEmail,
            }).session(session);

            await session.commitTransaction();
            session.endSession();

            // best-effort cleanup
            Promise.allSettled(
                files.map(file =>
                    deleteS3Object(`${file._id}${file.extension}`)
                )
            );

            await removeRedisSession(req, res);

            return res.status(200).json({
                success: true,
                message: 'Account deleted permanently',
            });

        } catch (err) {
            await session.abortTransaction().catch(() => { });
            session.endSession();

            const isTransient =
                err?.errorLabels?.includes('TransientTransactionError');

            if (isTransient && attempt < MAX_RETRIES) {
                console.warn(`Retrying delete (attempt ${attempt})`);
                continue;
            }

            return next(err);
        }
    }
});

router.post('/disable', async (req, res, next) => {
    try {

        // 1️⃣ Auth guard
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const userId = req.user._id;

        // 2️⃣ Fetch user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // 3️⃣ Prevent double-disable (idempotency)
        if (user.isDisabled) {
            return res.status(400).json({ message: 'Account already disabled' });
        }

        // 4️⃣ Fetch active subscription (if any)
        const subscription = await Subscription.findOne({
            userId,
            status: 'active',
        });

        if (subscription && subscription?.LemonSqueezySubscriptionId) {
            // 5️⃣ Calculate resume date (30 days example)
            const resumesAt = new Date();
            resumesAt.setDate(resumesAt.getDate() + 30);

            // 6️⃣ Pause subscription in Lemon Squeezy
            await pauseSubscriptionInLemonSqueezy(
                subscription.LemonSqueezySubscriptionId,
                resumesAt.toISOString()
            );
        }

        // 7️⃣ Disable user (soft delete)
        user.isDisabled = true;
        user.disabledAt = new Date();
        await user.save();

        await removeRedisSession(req, res);
        return res.status(200).json({
            message: 'Account disabled successfully',
        });
    } catch (err) {
        next(err);
    }
});

//enable account
router.post('/enable', async (req, res, next) => {
    try {
        // 1️⃣ Auth guard
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const userId = req.user._id;

        // 2️⃣ Fetch user
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // 3️⃣ Idempotent behavior
        if (!user.isDisabled) {
            return res.status(200).json({
                message: 'Account is already enabled',
            });
        }

        // 4️⃣ Enable account
        user.isDisabled = false;
        user.disabledAt = null;
        await user.save();

        // 5️⃣ Unpause subscription if needed
        const subscription = await Subscription.findOne({
            userId,
            status: 'paused',
            LemonSqueezySubscriptionId: { $exists: true },
        });

        if (subscription) {
            try {
                await unpauseSubscriptionInLemonSqueezy(
                    subscription.LemonSqueezySubscriptionId
                );

            } catch (lsError) {
                // ⚠️ Soft failure: account enabled but subscription not resumed
                console.error('Lemon Squeezy unpause failed:', lsError);
            }
        }

        return res.status(200).json({
            message: 'Account enabled successfully',
        });
    } catch (err) {
        next(err);
    }
});




export default router











