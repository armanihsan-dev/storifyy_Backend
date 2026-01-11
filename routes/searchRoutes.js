import express from "express";
import Directory from './../models/directoryModel.js';
import File from './../models/fileModel.js';


const router = express.Router();

import mongoose from "mongoose";


router.get("/", async (req, res, next) => {
    try {

        const { q, parendDirId } = req.query;
        const parentDirectoryID = parendDirId || req.user.rootDirId
        const userObjectId = new mongoose.Types.ObjectId(req.user._id);
        if (!q) {
            return res.json({ directories: [], files: [] });
        }

        const [directories, files] = await Promise.all([
            Directory.find(
                { $text: { $search: q }, userId: userObjectId, parentDirId: parentDirectoryID },
                { score: { $meta: "textScore" } }
            )
                .sort({ score: { $meta: "textScore" } })
                .limit(20),

            File.find(
                { $text: { $search: q }, userId: userObjectId, parentDirId: parentDirectoryID },
                { score: { $meta: "textScore" } }
            )
                .sort({ score: { $meta: "textScore" } })
                .limit(20),
        ]);
        console.log({ directories, files });

        res.json({ directories, files });
    } catch (err) {
        next(err);
    }
});

export default router;
