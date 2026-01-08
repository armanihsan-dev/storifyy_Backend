import express from 'express';
import { handleSubscriptionCanceled, handleSubscriptionCreated, handleSubscriptionExpired, handleSubscriptionPaused, handleSubscriptionResumed } from '../LemonSqueezy/WebHooksHandlers.js'
const router = express.Router();



router.post('/', async (req, res) => {
    try {
        const event = req.parsedBody;
        const eventName = event.meta.event_name;
        const subscription = {
            id: event.data.id,
            ...event.data.attributes
        };
        const userId = event.meta.custom_data?.user_id

        switch (eventName) {
            case 'subscription_created':
                await handleSubscriptionCreated(subscription, userId);
                break;

            case 'subscription_cancelled':
                await handleSubscriptionCanceled(subscription);
                break;

            case 'subscription_paused':
                await handleSubscriptionPaused(subscription);
                break;

            case 'subscription_unpaused':
                await handleSubscriptionResumed(subscription);
                break
            case 'subscription_resumed':
                await handleSubscriptionResumed(subscription);
                break;

            case 'subscription_expired':
                await handleSubscriptionExpired(subscription);
                break;


            default:
                console.log('⚠️ Unhandled event:', eventName);
        }

        res.status(200).send('Webhook received');
    } catch (err) {
        console.error('Error handling Lemon Squeezy webhook:', err);
        return res.status(500).json({ error: 'Webhook handler failed' });
    }
});

export default router;
