import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema(
    {
        LemonSqueezySubscriptionId: {
            type: String,
            default: null,
            index: true
        },
        order_id: {
            type: Number
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        variantId: {
            type: Number,
            required: true
        },
        variantName: {
            type: String,
            default: 'Free'
        },
        status: {
            type: String,
            enum: [
                'created',
                'pending',
                'active',
                'past_due',
                'paused',
                'cancelled',
                'expired'
            ],
            default: 'created'
        },

        currentPeriodEnd: {
            type: Date,
            default: null
        },
        customerPortalUrl: {
            type: String,
            default: null,
        }
    },
    { strict: 'throw', timestamps: true }
);

const Subscription = mongoose.model('Subscription', subscriptionSchema);
export default Subscription;
