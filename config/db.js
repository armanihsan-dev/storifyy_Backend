
import mongoose from "mongoose";


export async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_SERVER_URL)

    } catch (error) {
        console.log(error);
        console.log('Could not connect to database.');
        process.exit(1)
    }

}
process.on('SIGINT', async () => {
    await mongoose.disconnect()
    console.log('Client Disconnected');
    process.exit(0)
})