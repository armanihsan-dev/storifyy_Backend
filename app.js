import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import directoryRoutes from "./routes/directoryRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { checkSubcription } from './middlewares/subscription.js'
import './config/LemonSqueezy.js'
import authRoutes from './routes/authRoutes.js'
import checkAuth from "./middlewares/authMiddleware.js";
import { connectDB } from './config/db.js';
import shareRoutes from './routes/shareRoutes.js'
import searchRoutes from "./routes/searchRoutes.js";

import LemonSqueezyRoutes from './routes/SubscriptionRoutes.js'
import lemonSqueezyWebHookRoutes from './routes/webHookRoutes.js'
import { verifyWebhookSignature } from './validators/LemonSqueezyFunctions.js'
import helmet from 'helmet'
import { limiter } from './middlewares/Limiter.js';

await connectDB()

const app = express();
export const mySecretKey = process.env.MY_SECRET_KEY

app.use(cookieParser(mySecretKey))
app.use(helmet())

app.use(
  cors({
    origin: process.env.ORIGIN_CLIENT_URL,
    credentials: true,
  })
);



app.use('/webhook/lemonsqueezy', express.raw({ type: 'application/json' }), verifyWebhookSignature, lemonSqueezyWebHookRoutes)
app.use(express.json());
app.use('/lsqueezy', checkAuth, LemonSqueezyRoutes)

// app.use(limiter)
app.use("/directory", checkAuth, checkSubcription, directoryRoutes);
app.use("/file", checkAuth, checkSubcription, fileRoutes);
app.use("/search", checkAuth, (req, res, next) => {
  next();
}, searchRoutes);
app.use("/user", userRoutes);
app.use("/auth", authRoutes);
app.use('/share', checkAuth, checkSubcription, shareRoutes)

app.use((err, req, res, next) => {
  console.log(err);
  res.status(err.status || 500).json({ message: "Something went wrong!!", error: err });
});

app.listen(process.env.NODE_SERVER_PORT, () => {
  console.log(`Server Started`);
});



