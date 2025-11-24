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
dotenv.config(); // must be called before using process.env
await connectDB()
dotenv.config();
const app = express();
export const mySecretKey = 'Procodrr-Storifyy-123'

app.use(express.json());
app.use(cookieParser(mySecretKey))


app.use(
  cors({
    origin: "http://localhost:5173",
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
  res.status(err.status || 500).json({ message: "Something went wrong!!" });
});


app.listen(3000, () => {
  console.log(`Server Started`);
});



