import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import directoryRoutes from "./routes/directoryRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import shareRoutes from "./routes/shareRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import accountRoutes from "./routes/accountRoutes.js";
import LemonSqueezyRoutes from "./routes/SubscriptionRoutes.js";
import lemonSqueezyWebHookRoutes from "./routes/webHookRoutes.js";

import checkAuth from "./middlewares/authMiddleware.js";
import { checkSubcription } from "./middlewares/subscription.js";
import { connectDB } from "./config/db.js";
import { verifyWebhookSignature } from "./validators/LemonSqueezyFunctions.js";

import {
  authLimiter,
  subscriptionLimiter,
  userLimiter,
  searchLimiter,
} from "./middlewares/Limiter.js";

import "./config/LemonSqueezy.js";

await connectDB();

const app = express();
export const mySecretKey = process.env.MY_SECRET_KEY;
app.set("trust proxy", 1);

app.use(cookieParser(mySecretKey));
app.use(helmet());


app.get('/', (req, res) => {
  res.status(200).json({ message: "Hello! this message is from storifyy" })
})
app.use(
  cors({
    origin: process.env.ORIGIN_CLIENT_URL,
    credentials: true,
  })
);

/* ✅ Webhook (NO rate limit) */
app.use(
  "/webhook/lemonsqueezy",
  express.raw({ type: "application/json" }),
  verifyWebhookSignature,
  lemonSqueezyWebHookRoutes
);

app.use(express.json());

/* 🔴 Auth */
app.use("/auth", authLimiter, authRoutes);

/* 🔴 Subscription / payment ..this text is add to check git in ubuntu*/
app.use(
  "/lsqueezy",
  checkAuth,
  subscriptionLimiter,
  LemonSqueezyRoutes
);

/* 🟡 User protected routes */
app.use(
  "/directory",
  checkAuth,
  checkSubcription,
  userLimiter,
  directoryRoutes
);

app.use(
  "/file",
  checkAuth,
  checkSubcription,
  userLimiter,
  fileRoutes
);

app.use(
  "/share",
  checkAuth,
  checkSubcription,
  userLimiter,
  shareRoutes
);

/* 🟢 Search */
app.use(
  "/search",
  checkAuth,
  searchLimiter,
  searchRoutes
);

/* 🟢 Account & user */
app.use("/account", checkAuth, userLimiter, accountRoutes);
app.use("/user", userRoutes);


//pm2 , aws ec2 instance
app.get('/err', (req, res) => {
  console.log('process exixted with error');
  process.exit(1);
})

/* ❌ Error handler */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    message: "Something went wrong",
  });
});

app.listen(process.env.NODE_SERVER_PORT, () => {
  console.log(`Server Started`);
});
