import express from 'express';
import '../config/LemonSqueezy.js';
import Subscription from './../models/SubscriptionModel.js';
import { cancelLemonSubscription, createNewCheckout, generateSubscriptionOrderInvoice, pauseSubscriptionInLemonSqueezy, resumeLemonSubscription, unpauseSubscriptionInLemonSqueezy } from '../validators/LemonSqueezyFunctions.js'


const router = express.Router();

const LMS_PRODUCTS = new Set([
    1193383, 1193389, 1193390,
    1193391, 1193392, 1193395,
]);



router.post('/create-subscription-checkout', async (req, res, next) => {
    try {
        const { variantId } = req.body;

        if (!LMS_PRODUCTS.has(Number(variantId))) {
            return res.status(400).json({ error: 'Invalid variant ID' });
        }

        const url = await createNewCheckout(variantId, req.user._id);

        res.json({ url });
    } catch (err) {
        next(err);
    }
});

//cancel subscription 
router.post('/cancel-subscription', async (req, res, next) => {
    try {
        const userId = req.user._id;
        const now = new Date();

        const subscription = await Subscription.findOne(
            {
                userId,
                currentPeriodEnd: { $gt: now },
            },
            { LemonSqueezySubscriptionId: 1 }
        );
        if (!subscription) {
            return res.status(404).json({ error: 'No active subscription found' });
        }
        // Call Lemon Squeezy ONLY
        const cancelResponse = await cancelLemonSubscription(subscription.LemonSqueezySubscriptionId);

        res.status(200).json({
            message: 'Subscription cancellation requested. It will remain active until period end.'
        });

    } catch (err) {
        next(err);
    }
});

//resume subscription
router.post('/resume-subscription', async (req, res, next) => {
    try {
        const userId = req.user._id;
        const now = new Date();

        const subscription = await Subscription.findOne(
            {
                userId,
                currentPeriodEnd: { $gt: now },
            },
            { LemonSqueezySubscriptionId: 1 }
        );
        if (!subscription) {
            return res.status(404).json({ error: 'No cancelled subscription found' });
        }
        // Resume subscription in Lemon Squeezy
        await resumeLemonSubscription(subscription.LemonSqueezySubscriptionId)
        res.status(200).json({
            message: 'Resuming subscriptions via API is not supported by Lemon Squeezy at this time.'
        })
    } catch (err) {
        next(err);
    }
})

router.post('/pause-subscription', async (req, res, next) => {
    try {
        const userId = req.user._id;

        // 1️⃣ Get subscription (read-only)
        const subscription = await Subscription.findOne({ userId });
        if (!subscription) {
            return res.status(404).json({
                error: 'No subscription found for this user'
            });
        }

        // 2️⃣ Guard invalid states
        if (['cancelled', 'expired'].includes(subscription.status)) {
            return res.status(400).json({
                error: `Cannot pause a ${subscription.status} subscription`
            });
        }

        if (subscription.status === 'paused') {
            return res.status(400).json({
                error: 'Subscription is already paused'
            });
        }

        // 3️⃣ Calculate resume date (example: 30 days)
        const now = new Date();
        const resumesAt = new Date(now);
        resumesAt.setDate(resumesAt.getDate() + 30);

        // 4️⃣ Pause in Lemon Squeezy ONLY
        await pauseSubscriptionInLemonSqueezy(
            subscription.LemonSqueezySubscriptionId,
            resumesAt.toISOString()
        );

        // ❌ DO NOT update DB here (webhook will do it)

        // 5️⃣ Respond immediately
        return res.json({
            message: 'Subscription pause requested successfully',
            resumesAt
        });

    } catch (err) {
        next(err);
    }
});

//unpause subscription
router.post('/unpause-subscription', async (req, res, next) => {
    try {
        const userId = req.user._id;

        // 1️⃣ Get subscription (read-only)
        const subscription = await Subscription.findOne({ userId });
        if (!subscription) {
            return res.status(404).json({
                error: 'No subscription found for this user'
            });
        }

        // 2️⃣ Guard invalid states
        if (['cancelled', 'expired'].includes(subscription.status)) {
            return res.status(400).json({
                error: `Cannot resume a ${subscription.status} subscription`
            });
        }

        if (subscription.status !== 'paused') {
            return res.status(400).json({
                error: 'Subscription is not paused'
            });
        }

        // 3️⃣ Resume in Lemon Squeezy ONLY
        await unpauseSubscriptionInLemonSqueezy(
            subscription.LemonSqueezySubscriptionId
        );

        // ❌ DO NOT update DB (webhook will handle it)

        // 4️⃣ Respond immediately
        return res.json({
            message: 'Subscription resume requested successfully'
        });

    } catch (err) {
        next(err);
    }
});

router.post('/subscriptions/invoice', async (req, res, next) => {
    try {
        const user = req.user
        const { variantId, address, state, city, country, notes, zipCode } = req.body;
        console.log(zipCode);
        const subscription = await Subscription.findOne({
            userId: user._id,
            variantId: variantId
        });

        if (!subscription) {
            return res.status(404).json({
                error: 'No subscription found for this variant.'
            });
        }

        const invoiceUrl = await generateSubscriptionOrderInvoice(
            subscription.order_id,
            user.name,
            address,
            city,
            state,
            country,
            zipCode,
            notes
        );
        console.log(invoiceUrl);

        res.json({ invoiceUrl });
    } catch (err) {
        next(err);
    }
});



router.get('/my-subscription', async (req, res) => {
    const userId = req.user._id;

    // Get latest subscription (any status)
    const subscription = await Subscription
        .findOne({ userId })
        .sort({ createdAt: -1 })
        .lean();

    // Never subscribed
    if (!subscription) {
        return res.json({
            plan: 'free',
            variantId: 1193383,
            status: 'free',
            hasAccess: true,
            accessEndsAt: null,
        });
    }

    const now = new Date();
    const periodEnd = subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd)
        : null;

    const hasAccess = periodEnd && now < periodEnd;

    const isGracePeriod =
        subscription.status === 'cancelled' && hasAccess;

    return res.json({
        subsId: subscription.LemonSqueezySubscriptionId,
        customerPortalUrl: subscription.customerPortalUrl,

        plan: subscription.variantName,
        variantId: subscription.variantId,

        status: subscription.status,            // raw Lemon status
        hasAccess,                               // 🔑 source of truth
        isGracePeriod,                           // UX helper
        renewsAt: periodEnd,                 // canonical date
    });
});

export default router;
