import express from 'express'
import User from '../models/userModel.js';
import Subscription from '../models/SubscriptionModel.js';
import Session from '../models/sessionModel.js';
import { pauseSubscriptionInLemonSqueezy, unpauseSubscriptionInLemonSqueezy } from '../validators/LemonSqueezyFunctions.js'
import redisClient from '../config/redis.js';
const router = express.Router();


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

        if (subscription?.LemonSqueezySubscriptionId) {
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
        const { sid } = req.signedCookies

        const redisKey = `session:${sid}`
        const session = await redisClient.del(redisKey)
        res.clearCookie('sid')
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


router.post('/delete', async (req, res, next) => {
    try {
        // 1️⃣ Auth guard
        if (!req.user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const userId = req.user._id;
        // 2️⃣ Fetch user
        const user = await User.findOne({
            _id: userId
        })
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ message: "Working on account delete" })
    } catch (err) {
        next(err);
    }
})


export default router











