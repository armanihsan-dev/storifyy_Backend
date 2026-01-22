import crypto from 'node:crypto';
import redisClient from '../config/redis.js';
import { createCheckout, generateOrderInvoice, updateSubscription } from '@lemonsqueezy/lemonsqueezy.js';


const FUTURE_SKEW_MS = 2 * 60 * 1000;//2 min
const STALE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const REPLAY_TTL_SECONDS = 10 * 60;   // 10 minutes


export async function hasProcessed(redisKey) {
    const existingDocument = await redisClient.get(redisKey)
    return existingDocument ? true : false
}

export async function markProcessed(redisKey) {
    await redisClient.setEx(redisKey, REPLAY_TTL_SECONDS, '1')
}

const verifyWebhookSignature = async (req, res, next) => {
    try {
        const signature = req.headers['x-signature'];
        const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

        if (!signature) {
            return res.status(401).json({ error: 'No signature' });
        }

        // 1️⃣ Verify HMAC (RAW BODY)
        const hmac = crypto.createHmac('sha256', secret);
        const digest = hmac.update(req.body).digest('hex');

        const sigBuffer = Buffer.from(signature, 'hex');
        const digestBuffer = Buffer.from(digest, 'hex');

        if (
            sigBuffer.length !== digestBuffer.length ||
            !crypto.timingSafeEqual(sigBuffer, digestBuffer)
        ) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // 2️⃣ Parse payload AFTER verification
        const payload = JSON.parse(req.body.toString());
        req.parsedBody = payload;

        const { meta, data } = payload;

        // 3️⃣ Replay protection (authoritative freshness)
        const redisKey = `lemon:${meta.webhook_id}`;

        if (await hasProcessed(redisKey)) {
            console.warn('🔁 Duplicate webhook ignored:', meta.webhook_id);
            return res.status(200).json({ status: 'ignored', reason: 'replay' });
        }

        await markProcessed(redisKey);

        // 4️⃣ Soft staleness warning (LOG ONLY)
        const updatedAt = data?.attributes?.updated_at;
        if (updatedAt) {
            const updatedTime = new Date(updatedAt).getTime();
            if (Date.now() - updatedTime > 7 * 24 * 60 * 60 * 1000) {
                console.warn('⚠️ Very old Lemon Squeezy webhook received');
            }
        }
        next();
    } catch (err) {
        console.error('❌ Webhook verification error:', err);
        return res.status(500).json({ error: 'Webhook verification failed' });
    }
};



//pause subscription
async function pauseSubscriptionInLemonSqueezy(
    subscriptionID,
    resumesAtISO // e.g. "2026-01-30T00:00:00.000Z"
) {
    if (!subscriptionID) {
        throw new Error("subscriptionID is required");
    }

    const response = await fetch(
        `https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionID}`,
        {
            method: "PATCH",
            headers: {
                "Accept": "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json",
                "Authorization": `Bearer ${process.env.LS_API_KEY}`,
            },
            body: JSON.stringify({
                data: {
                    type: "subscriptions",
                    id: subscriptionID,
                    attributes: {
                        pause: {
                            mode: "free", // free | billable
                            resumes_at: resumesAtISO,
                        },
                    },
                },
            }),
        }
    );

    const data = await response.json();

    if (!response.ok) {
        console.error("Lemon Squeezy pause error:", data);
        throw new Error("Failed to pause subscription");
    }

    return data;
}

//unpause subscriptoin
async function unpauseSubscriptionInLemonSqueezy(subscriptionID) {
    if (!subscriptionID) {
        throw new Error("subscriptionID is required");
    }

    const response = await fetch(
        `https://api.lemonsqueezy.com/v1/subscriptions/${subscriptionID}`,
        {
            method: "PATCH",
            headers: {
                "Accept": "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json",
                "Authorization": `Bearer ${process.env.LS_API_KEY}`,
            },
            body: JSON.stringify({
                data: {
                    type: "subscriptions",
                    id: subscriptionID,
                    attributes: {
                        pause: null, // ✅ this RESUMES subscription
                    },
                },
            }),
        }
    );

    const data = await response.json();

    if (!response.ok) {
        console.error("Lemon Squeezy unpause error:", data);
        throw new Error("Failed to unpause subscription");
    }

    return data;
}



//cancel lemonSqueezy Subscription
async function cancelLemonSubscription(lemonSubscriptionId) {

    const subscription = await updateSubscription(lemonSubscriptionId, {
        cancelled: true
    });
    return subscription;
}

//resume lemonsuqeezy subscription
async function resumeLemonSubscription(lemonSubscriptionId) {
    const subscription = await updateSubscription(lemonSubscriptionId, {
        cancelled: false
    })
    return subscription;
}


async function createNewCheckout(variantId, userId) {
    const storeId = process.env.STORE_ID;

    const checkoutData = {
        productOptions: {
            enabledVariants: [Number(variantId)],
            redirect_url: process.env.ORIGIN_CLIENT_URL,
        },
        checkoutOptions: {
            buttonColor: '#f0068bff',
        },
        checkoutData: {
            custom: {
                userId: userId.toString(),
            }
        }
    };

    const response = await createCheckout(storeId, variantId, checkoutData);

    return response.data.data.attributes.url;
}

const COUNTRY_MAP = {
    PK: 'Pakistan',
    US: 'United States',
    IN: 'India',
    GB: 'United Kingdom',
};

async function generateSubscriptionOrderInvoice(
    orderId,
    name,
    address,
    city,
    state,
    country,
    zipCode,
    notes
) {
    const normalizedCountry = COUNTRY_MAP[country] ?? country;

    // console.log({ orderId, name, address, city, state, country, zipCode, notes });
    const { data, error } = await generateOrderInvoice(orderId, {
        name,
        address,
        city,
        state,
        country,
        zipCode: Number(zipCode),
        notes,
    });

    if (error) {
        console.error('Invoice generation failed:', error);
        throw error;
    }

    return data?.meta?.urls?.download_invoice;
}




export { verifyWebhookSignature, unpauseSubscriptionInLemonSqueezy, cancelLemonSubscription, createNewCheckout, resumeLemonSubscription, pauseSubscriptionInLemonSqueezy, generateSubscriptionOrderInvoice };
