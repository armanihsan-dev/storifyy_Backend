import { lemonSqueezySetup } from '@lemonsqueezy/lemonsqueezy.js';

// Initialize the SDK
const config = lemonSqueezySetup({
    apiKey: process.env.LS_API_KEY,
    onError: (error) => {
        console.error('Lemon Squeezy Error:', error);
    }
});
