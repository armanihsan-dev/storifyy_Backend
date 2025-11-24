import express from "express";
import validateIdMiddleware from "../middlewares/validateIdMiddleware.js";
import { createDirectory, deleteDirectory, deleteUserDirectory, getDirectory, renameDirectory } from "../controller/directoryControllers.js";
import checkAuth from "../middlewares/authMiddleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import Directory from "../models/directoryModel.js";
import User from "../models/userModel.js";
import File from "../models/fileModel.js";
import { rm } from "fs/promises";
import mongoose from "mongoose";
import { truncateSync } from "fs";

const ROLE_HIERARCHY = ["User", "Manager", "Admin", "Owner"];


const router = express.Router();

router.param('id', validateIdMiddleware)
router.param('parentDirId', validateIdMiddleware)
// Read
router.get("/:id?", getDirectory);

router.post("/:parentDirId?", createDirectory);

router.patch("/:id", renameDirectory);


router.delete("/:id", deleteDirectory);

router.get('/userDirectory/:userId', checkAuth, checkRole, async (req, res) => {

    try {
        const { userId } = req.params;

        // 1️⃣ Get the target and acting user
        const actinguser = req.user
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ error: "User not found" });
        }
        const actingRank = ROLE_HIERARCHY.indexOf(actinguser.role)
        const targetRank = ROLE_HIERARCHY.indexOf(targetUser.role)

        if (actingRank < targetRank) {
            return res.status(403).json({ error: ` ${actinguser.role} not have permission to access ${targetUser.role} directory.`, isLowerRank: true });
        }
        // 2️⃣ Get the ROOT directory of that user
        const rootId = targetUser.rootDirId.toString();
        // 3️⃣ Find root directory
        const directoryData = await Directory.findById(rootId).lean();
        if (!directoryData) {
            return res
                .status(404)
                .json({ error: "Directory not found or you do not have access to it!" });
        }

        // 4️⃣ Get all files in this directory
        const files = await File.find({ parentDirId: rootId }).lean();

        // 5️⃣ Get all all sub-directories
        const directories = await Directory.find({ parentDirId: rootId }).lean();

        // 6️⃣ Return combined response
        return res.status(200).json({
            ...directoryData,
            files: files.map((file) => ({ ...file, id: file._id })),
            directories: directories.map((dir) => ({ ...dir, id: dir._id }))
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

router.get('/singledirectory/:dirId', checkAuth, checkRole, async (req, res) => {
    try {
        const { dirId } = req.params;

        // Get directory data
        const directoryData = await Directory.findById(dirId).lean();
        if (!directoryData) {
            return res.status(404).json({ error: "Directory not found!" });
        }

        // Get all files inside this directory
        const files = await File.find({ parentDirId: dirId }).lean();

        // Get all subdirectories inside this directory
        const directories = await Directory.find({ parentDirId: dirId }).lean();

        return res.status(200).json({
            ...directoryData,
            files: files.map((file) => ({ ...file, id: file._id })),
            directories: directories.map((dir) => ({ ...dir, id: dir._id }))
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal server error" });
    }
});


router.put('/renameUserDirectory/:dirId', checkAuth, checkRole, async (req, res) => {

    try {
        const { name } = req.body
        const { dirId } = req.params

        const updated = await Directory.findByIdAndUpdate(dirId, { name }, { new: true })
        if (!updated) return res.status(404).json({ error: "Not found" });
        res.status(200).json({ message: "Directory renamed" })
    } catch (err) {
        res.status(500).json({ error: "Can't rename directory", err })
    }
})



router.delete('/deleteUserDirectory/:id', checkAuth, checkRole, deleteUserDirectory)
export default router;
