import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import directoryRoutes from "./routes/directoryRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import authRoutes from './routes/authRoutes.js'
import checkAuth from "./middlewares/authMiddleware.js";
import { connectDB } from './config/db.js';
import shareRoutes from './routes/shareRoutes.js'
import helmet from 'helmet'
import { limiter } from './middlewares/Limiter.js';

await connectDB()

const app = express();
export const mySecretKey = process.env.MY_SECRET_KEY

app.use(express.json());
app.use(cookieParser(mySecretKey))
app.use(helmet())



// app.use(limiter)

app.use(
  cors({
    origin: process.env.ORIGIN_CLIENT_URL,
    credentials: true,
  })
);
app.use((req, res, next) => {
  next()
})

app.use("/directory", checkAuth, directoryRoutes);
app.use("/file", checkAuth, fileRoutes);
app.use("/user", userRoutes);
app.use("/auth", authRoutes);
app.use('/share', shareRoutes)
app.use((err, req, res, next) => {
  console.log(err);
  res.status(err.status || 500).json({ message: "Something went wrong!!", error: err });
});

app.listen(process.env.NODE_SERVER_PORT, () => {
  console.log(`Server Started`);
});



