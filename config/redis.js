import { createClient } from "redis";

const redisClient = createClient({ url: process.env.REDIS_ATLAS_URL, password: process.env.REDIS_SERVER_PASS })
redisClient.on("error", (err) => {
    console.log("Redis Client Error", err)
    process.exit(1)
});

await redisClient.connect();
async function ensureIndexes() {
    try {
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
        console.log('Redis index userIdIdx created');
    } catch (err) {
        if (err.message.includes('Index already exists')) {
            console.log('Redis index already exists');
        } else {
            throw err;
        }
    }
}

await ensureIndexes();
export default redisClient