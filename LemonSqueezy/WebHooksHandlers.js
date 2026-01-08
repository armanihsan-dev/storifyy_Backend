import Subscription from "../models/SubscriptionModel.js";
import User from './../models/userModel.js';
import { getFreePlan, varianstPlans } from './variantStorage.js';

function normalizeSubscription(subscription) {
    return {
        lemonSubscriptionId: String(subscription.id), // ✅ correct
        orderId: subscription.order_id,               // ✅ normalized
        variantId: subscription.variant_id,
        status: subscription.status,
        userEmail: subscription.user_email,
        renewsAt: subscription.renews_at
            ? new Date(subscription.renews_at)
            : null,
        endsAt: subscription.ends_at
            ? new Date(subscription.ends_at)
            : null,
        cancelled: subscription.cancelled,
        customerPortalUrl: subscription.urls?.customer_portal ?? null,
    };
}

export async function handleSubscriptionCreated(subscription, userId) {
    if (!userId) {
        throw new Error('Missing user_id in webhook meta');
    }

    const data = normalizeSubscription(subscription);

    const plan = varianstPlans.find(
        (variant) => variant.lsId === data.variantId
    );

    if (!plan) {
        throw new Error(`Unknown variant ID: ${data.variantId}`);
    }

    const statusMap = {
        active: 'active',
        cancelled: 'cancelled',
        paused: 'paused',
        expired: 'expired',
        past_due: 'past_due',
    };

    await Subscription.findOneAndUpdate(
        { LemonSqueezySubscriptionId: data.lemonSubscriptionId },
        {
            userId,
            order_id: data.orderId,
            variantId: data.variantId,
            variantName: plan.name,
            status: statusMap[data.status] ?? 'pending',
            currentPeriodEnd: data.renewsAt,
            customerPortalUrl: data.customerPortalUrl,
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        }
    );

    await User.findByIdAndUpdate(userId, {
        maxStorageInBytes: plan.storageBytes,
        maxUploadBytes: plan.maxUploadBytes,
    });

    console.log('🟢 Subscription activated / updated:', {
        userId,
        lemonSubscriptionId: data.lemonSubscriptionId,
        plan: plan.name,
        variantId: data.variantId,
    });
}

export async function handleSubscriptionExpired(subscriptionData) {
    const subscription = await Subscription.findOne({
        LemonSqueezySubscriptionId: subscriptionData.id,
    });

    if (!subscription) return;

    const freePlan = getFreePlan();

    // 1️⃣ Mark expired
    subscription.status = 'expired';
    subscription.variantName = 'Free';
    subscription.currentPeriodEnd = new Date();
    await subscription.save();

    // 2️⃣ Downgrade user limits
    await User.findByIdAndUpdate(subscription.userId, {
        maxStorageInBytes: freePlan.storageBytes,
        maxUploadBytes: freePlan.maxUploadBytes,
    });
}
export async function handleSubscriptionCanceled(subscription) {
    await Subscription.findOneAndUpdate(
        { LemonSqueezySubscriptionId: subscription.id },
        {
            status: 'cancelled',
            currentPeriodEnd: subscription.ends_at
                ? new Date(subscription.ends_at)
                : null
        }
    );
}
export async function handleSubscriptionResumed(subscription) {

    await Subscription.findOneAndUpdate(
        { LemonSqueezySubscriptionId: subscription.id },
        {
            status: 'active',
        }
    );

}


export async function handleSubscriptionPaused(subscriptionData) {
    const subscription = await Subscription.findOne({
        LemonSqueezySubscriptionId: subscriptionData.id,
    });

    if (!subscription) return;

    subscription.status = 'paused';

    // Save resume date if Lemon Squeezy sent it
    if (subscriptionData.pause?.resumes_at) {
        subscription.resumesAt = new Date(subscriptionData.pause.resumes_at);
    }

    await subscription.save();

    console.log('⏸️ Subscription paused:', {
        lemonSubscriptionId: subscriptionData.id,
        resumesAt: subscription.resumesAt || null,
    });
}
