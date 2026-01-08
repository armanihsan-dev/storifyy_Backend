import Directory from "../models/directoryModel.js";
import Subscription from "../models/SubscriptionModel.js";

//add subsciption object to request
async function checkSubcription(req, res, next) {
    const subscription = await Subscription.findOne({ userId: req.user._id }).lean()
    req.subscription = subscription
    next()
}

// middlewares/requireActiveSubscription.js
async function requireActiveSubscription(req, res, next) {
    const user = req.user;
    const sub = req.subscription; // may be null for free users

    const rootDir = await Directory.findOne({ userId: user._id });
    if (!rootDir) {
        return res.status(404).json({ error: 'Root directory not found' });
    }

    const incomingSize = req.body.size || 0;
    const projectedSize = rootDir.size + incomingSize;

    // ❌ Storage full → block everyone
    if (projectedSize > user.maxStorageInBytes) {
        return res.status(403).json({
            error: 'Storage limit reached'
        });
    }

    // ✅ No subscription → free user → allow (within quota)
    if (!sub) {

        return next();
    }

    // ✅ Active subscription → allow
    if (sub.status === 'active') {

        return next();
    }

    // ✅ Expired subscription → allow while under quota
    if (sub.status === 'expired') {
        return next();
    }
    // ❌ Cancelled or paused → block
    return res.status(403).json({
        error: `Uploads disabled (subscription ${sub.status})`
    });
}


export { checkSubcription, requireActiveSubscription }