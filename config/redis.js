import 'dotenv/config';
import { createClient } from "redis";

if (!process.env.REDIS_ATLAS_URL) {
    throw new Error("REDIS_ATLAS_URL is missing");
}

const redisClient = createClient({
    url: process.env.REDIS_ATLAS_URL
});

redisClient.on("error", (err) => {
    console.error("Redis Client Error:", err.message);
});

await redisClient.connect();

async function ensureIndexes() {
    try {
        await redisClient.ft.info('userIdIdx');
        console.log('Redis index already exists');
    } catch {
        await redisClient.ft.create(
            'userIdIdx',
            {
                userId: {
                    type: 'TAG',
                    AS: 'userId',
                    path: '$.userId',
                },
            },
            {
                ON: 'JSON',
                PREFIX: 'session:',
            }
        );
        console.log('Redis index created');
    }
}

await ensureIndexes();

export default redisClient;
