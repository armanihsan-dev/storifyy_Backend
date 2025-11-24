
import mongoose from "mongoose";


export async function connectDB() {
    try {
        await mongoose.connect('mongodb://fancy:fancy@127.0.0.1:27017/storageApp?replicaSet=rs0')

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