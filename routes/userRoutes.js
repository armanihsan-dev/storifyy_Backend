import express from "express";
import checkAuth, { isStrongPassoword } from '../middlewares/authMiddleware.js';
import { softDeleteUser, getAllUsers, login, logoutUserById, register, hardDeleteUser, changeRole, recoverUser } from './../controller/userController.js';
import Session from "../models/sessionModel.js";
import { checkRole } from './../middlewares/checkRole.js';
import User from "../models/userModel.js";
import bcrypt from 'bcrypt'
import { sendOtp } from "../controller/authControllers.js";
import OTP from "../models/otpModel.js";
import { fileURLToPath } from 'url';
import fs from 'fs';              // classic fs for streams
import fsp from 'fs/promises';
import path from 'path';
import File from "../models/fileModel.js";
const router = express.Router();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.post('/share/:email', checkAuth, async (req, res) => {
  const storagePath = path.join(__dirname, '..', 'storage');

  try {
    const { email } = req.params;
    const { fileid } = req.body;

    const actingUser = req.user;

    // Find user
    const targetUser = await User.findOne({ email });
    if (!targetUser) {
      return res.status(404).json({ error: "User to share with not found" });
    }

    if (actingUser.email === targetUser.email) {
      return res.status(400).json({ error: "Cannot share with yourself" });
    }

    // Find original file doc
    const fileDocument = await File.findById(fileid);
    if (!fileDocument) {
      return res.status(404).json({ error: "File document not found" });
    }

    const originalFilename = `${fileDocument._id}${fileDocument.extension}`;
    const originalFilePath = path.join(storagePath, originalFilename);

    // 3. Ensure file exists
    try {
      await fsp.access(originalFilePath);
    } catch (err) {
      return res.status(404).json({ error: "File not found in storage" });
    }

    // Create new file doc for target user
    const newDoc = await File.create({
      name: fileDocument.name,
      extension: fileDocument.extension,
      userId: targetUser._id,
      parentDirId: targetUser.rootDirId
    });

    const newFileName = `${newDoc._id}${newDoc.extension}`;
    const newFilePath = path.join(storagePath, newFileName);

    // Copy file using streams
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(originalFilePath);
      const writeStream = fs.createWriteStream(newFilePath);

      readStream.on("error", reject);
      writeStream.on("error", reject);
      writeStream.on("finish", resolve);

      readStream.pipe(writeStream);
    });

    return res.status(200).json({
      message: "File shared successfully",
      file: newDoc,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error sharing data", err });
  }
});



router.post('/register', register)

router.post('/login', login)

router.get('/', checkAuth, (req, res) => {
  const user = req.user;

  // NEVER send password, even hashed
  const userToBeSent = {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    picture: user.picture,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    hasPassword: !!user.password
  };

  res.status(200).json(userToBeSent);
});



router.post('/logout', async (req, res) => {
  const { sid } = req.signedCookies
  const session = await Session.findByIdAndDelete(sid)
  res.clearCookie('sid')
  res.status(200).json({ message: "Logged Out!" })
})

router.post('/logoutfromAllAccounts', async (req, res) => {
  try {
    const { sid } = req.signedCookies
    const session = await Session.findById(sid)

    await Session.deleteMany({ userId: session.userId })
    res.clearCookie('sid')
    res.status(200).json({ message: "Logged Out from all accounts!" })
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" })
  }
})
router.post('/logoutuser/:userId', checkAuth, checkRole, logoutUserById)
router.get('/users', checkAuth, checkRole, getAllUsers);


router.delete('/softdeleteuser/:userid', checkAuth, checkRole, softDeleteUser);
router.delete('/harddeleteuser/:userid', checkAuth, checkRole, hardDeleteUser);

router.post('/recoveruser/:userid', checkAuth, checkRole, recoverUser)

router.post('/changerole', checkAuth, checkRole, changeRole);
router.get('/getUserInfo/:userid', checkAuth, async (req, res) => {

  try {
    const { userid } = req.params
    const user = await User.findById(userid).lean()
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }
    res.status(200).json(user)
  } catch (err) {
    res.status(500).json({ error: "Error getting user info", err })
  }
})



router.post("/setpassword", checkAuth, isStrongPassoword, async (req, res) => {
  const user = req.user
  try {
    const { password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const updatedUser = await User.findByIdAndUpdate(user._id, { password: hashedPassword }, { new: true });
    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error setting password:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post('/updatePassword', checkAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = req.user;

    // 1. Validate input
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Both fields are required" });
    }

    // 2. Prevent same password reuse
    if (oldPassword === newPassword) {
      return res.status(400).json({ error: "New password cannot be same as old password" });
    }
    // 3. Password strength validation
    const strongPasswordRegex = /^(?=.*[0-9])(?=.*[A-Z])(?=.*[!@#$%^&*]).{8,}$/;

    if (!strongPasswordRegex.test(newPassword)) {
      return res.status(400).json({
        error: "Weak password: must be 8+ chars, include uppercase, number & special symbol"
      });
    }

    // 4. Validate old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Old password is incorrect" });
    }

    // 5. Hash and update
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    const updatedUserWithNewPassword = await User.findByIdAndUpdate(user._id, { password: hashedNewPassword });

    // ❗Delete the user’s current login session after password change.
    //Any attacker with an active session should be kicked out immediately
    await Session.deleteMany({ userId: updatedUserWithNewPassword._id })
    return res.status(200).json({ message: "Password updated successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error updating password" });
  }
});

router.post('/sendotp', checkAuth, sendOtp)
router.post('/verifyotp', checkAuth, async (req, res, next) => {
  const actingUser = req.user
  try {
    const { email, otp } = req.body
    if (!email || !otp) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }
    // Here you would typically verify the OTP against a stored value
    const otpRecord = await OTP.findOne({ email, otp })

    if (!otpRecord) {
      return res.status(400).json({ error: "No OTP found for this email" });
    }
    if (otpRecord.otp == otp) {
      await User.findOneAndUpdate({ _id: actingUser._id }, { $unset: { password: 1 } }, { new: true })
      await otpRecord.deleteOne()
      return res.status(200).json({ message: "OTP verified successfully" });
    }
  } catch (error) {
    next(error)
  }
})



export default router;

