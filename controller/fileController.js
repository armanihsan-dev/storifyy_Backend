
import { rm } from 'fs/promises';
import { createWriteStream } from "fs";
import fs from 'fs/promises';
import path from "path";
import { fileURLToPath } from "url";
import Directory from './../models/directoryModel.js';
import File from './../models/fileModel.js';
import User from '../models/userModel.js';
import { ROLE_HIERARCHY } from './userController.js';
import Share from '../models/shareModel.js';
import mongoose from 'mongoose';
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, "..");

export const updateParentDirectorySize = async (startDirId, deltaSize, session = null) => {
    const parents = [];
    let currentDirId = startDirId;

    // Step 1: collect parents with size
    while (currentDirId) {
        const dir = await Directory.findById(
            currentDirId,
            "parentDirId size"
        ).session(session);

        if (!dir) break;

        parents.push(dir);
        currentDirId = dir.parentDirId;
    }

    if (parents.length === 0) return;

    // Step 2: create bulk update operations
    const bulkOps = parents.map(dir => {
        const newSize = Math.max(0, dir.size + deltaSize);

        return {
            updateOne: {
                filter: { _id: dir._id },
                update: { $set: { size: newSize } }
            }
        };
    });

    // Step 3: run ONE bulkWrite (super efficient)
    await Directory.bulkWrite(bulkOps, { session });
};



export const createFile = async (req, res, next) => {
    try {
        const parentDirId = req.params.parentDirId || req.user.rootDirId;

        const parentDirData = await Directory.findOne({
            _id: parentDirId,   
            userId: req.user._id,
        });

        const userDocument = await User.findById(req.user._id);

        if (!parentDirData) {
            return res.status(404).json({ error: "Parent directory not found!" });
        }

        // Incoming file info from headers
        const fileSize = Number(req.headers.filesize) || 0;
        const filename = req.headers.filename || "untitled";
        const extension = path.extname(filename);

        // Hard max per-file upload (optional)
        const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
        if (fileSize > MAX_FILE_SIZE) {
            req.destroy();
            return res.status(400).json({ error: "File size exceeds 100MB limit." });
        }

        // STORAGE LIMIT VALIDATION
        const currentUsed = parentDirData.size; // root size tracks total storage
        const maxAllowed = userDocument.maxStorageInBytes;

        const availableSpace = maxAllowed - currentUsed;

        //  Reject if file is larger than available space
        if (fileSize > availableSpace) {
            req.destroy();
            return res.status(400).json({
                error: `Not enough storage. Available: ${availableSpace} bytes`,
            });
        }

        // INSERT FILE RECORD
        const savedFile = await File.insertOne({
            extension,
            size: fileSize,
            name: filename,
            parentDirId: parentDirData._id,
            userId: req.user._id,
        });

        const fileID = savedFile.id;
        const fullFileName = `${fileID}${extension}`;
        const filePath = `./storage/${fullFileName}`;

        const writeStream = createWriteStream(filePath);
        let aborted = false;

        let totalFileSize = 0;

        req.on("data", async (chunk) => {
            if (aborted) return;

            totalFileSize += chunk.length;

            // Stop if stream exceeds declared file size
            if (totalFileSize > fileSize) {
                aborted = true;
                await savedFile.deleteOne();
                await rm(filePath);
                writeStream.destroy();
                return req.destroy();
            }

            // Stop if stream exceeds available space
            if (totalFileSize > availableSpace) {
                aborted = true;
                await savedFile.deleteOne();
                await rm(filePath);
                writeStream.destroy();
                return req.destroy();
            }

            // Backpressure support
            if (!writeStream.write(chunk)) {
                req.pause();
                writeStream.once("drain", () => req.resume());
            }
        });

        req.on("end", async () => {
            try {
                if (aborted) return;

                writeStream.end();

                // Update storage usage
                await updateParentDirectorySize(parentDirData._id, +fileSize);

                return res.status(201).json({
                    message: "File Uploaded",
                    used: currentUsed + fileSize,
                    max: maxAllowed,
                });
            } catch (err) {
                next(err);
            }
        });

        writeStream.on("error", async (err) => {
            console.error("Write stream error:", err);
            await File.deleteOne({ _id: fileID });
            return res.status(500).json({ message: "File not saved on server" });
        });

        req.on("error", async (err) => {
            console.error("Request error:", err);
            await File.deleteOne({ _id: fileID });
            return res.status(500).json({ message: "Upload failed" });
        });
    } catch (error) {
        console.log(error);
        next(error);
    }
};


export const deleteFile = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        // 1️⃣ Fetch file document
        const fileData = await File.findById(id).session(session);
        if (!fileData) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ error: "File not found!" });
        }

        const fileSize = fileData.size;

        // 2️⃣ Verify parent directory belongs to the user
        let parentDir = await Directory.findOne({
            _id: fileData.parentDirId,
            userId: req.user._id
        }).session(session);

        if (!parentDir) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ error: "Parent directory not found!" });
        }

        // 3️⃣ Remove file from filesystem safely
        const filePath = path.join("storage", `${id}${fileData.extension}`);
        try {
            await fs.unlink(filePath);
        } catch (err) {
            console.warn("⚠ File missing on disk, continuing:", err.message);
        }

        // 4️⃣ Remove shares
        await Share.deleteMany({ fileId: id }).session(session);

        // 5️⃣ Delete file from DB
        await File.deleteOne({ _id: id }).session(session);

        // 6️⃣ Decrease sizes from all parent directories (recursive upward update)
        await updateParentDirectorySize(parentDir._id, -fileSize, session);


        // 7️⃣ Commit transaction
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({ message: "File deleted successfully" });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        console.error("❌ Delete failed:", err);
        return res.status(500).json({ error: "Failed to delete file", details: err.message });
    }
};

export const readFileById = async (req, res) => {
    try {

        const { id } = req.params;
        const fileData = await File.findOne({ _id: id }).lean()

        // Check if file exists
        if (!fileData) {
            return res.status(404).json({ error: "File not found!" });
        }

        // Check parent directory ownership
        const parentDir = await Directory.findOne({ _id: fileData.parentDirId, userId: req.user._id }).lean()
        if (!parentDir) {
            return res.status(404).json({ error: "Parent directory not found!" });
        }

        const filePath = `${projectRoot}/storage/${id}${fileData.extension}`
        // If "download" is requested, set the appropriate headers
        if (req.query.action === "download") {
            return res.download(filePath, fileData.name)
        }

        // Send file
        return res.sendFile(`${filePath}`, (err) => {
            if (!res.headersSent && err) {
                return res.status(404).json({ error: "File not found!" });
            }
        });
    } catch (error) {
        console.log(error);
        next(error)
    }
}

export const renameFile = async (req, res, next) => {
    const { id } = req.params;
    const { newFilename } = req.body
    const fileData = await File.findOne({ _id: id })

    // Check if file exists
    if (!fileData) {
        return res.status(404).json({ error: "File not found!" });
    }

    // Check parent directory ownership
    const parentDir = await Directory.findOne({ _id: fileData.parentDirId, userId: req.user._id }).lean()
    if (!parentDir) {
        return res.status(404).json({ error: "Parent directory not found!" });
    }

    // Perform rename
    try {
        await File.findByIdAndUpdate(id, { name: newFilename })
        fileData.name = newFilename
        await fileData.save()
        return res.status(200).json({ message: "Renamed" });
    } catch (err) {
        err.status = 500;
        next(err);
    }
}





export const readUserFile = async (req, res, next) => {
    const { fileid } = req.params;

    try {
        // 1. Check if file exists
        const file = await File.findById(fileid).lean();
        if (!file) {
            return res.status(404).json({ error: "File not found!" });
        }

        // 2. Get file-owner user
        const fileUser = await User.findOne({ _id: file.userId }).lean();
        if (!fileUser) {
            return res.status(404).json({ error: "File owner not found!" });
        }

        // 3. Get acting user
        const actingUser = req.user;

        // 4. Compare role hierarchy
        const targetUserRank = ROLE_HIERARCHY.indexOf(fileUser.role);
        const actingUserRank = ROLE_HIERARCHY.indexOf(actingUser.role);

        if (actingUserRank < targetUserRank) {
            return res.status(403).json({ error: "Access denied" });
        }

        // 5. Build actual file path
        const filePath = path.join(
            projectRoot,
            "storage",
            `${fileid}${file.extension}`
        );

        // 6. Check `?action=download`
        if (req.query.action === "download") {
            return res.download(filePath, file.name, (err) => {
                if (err && !res.headersSent) {
                    return res.status(404).json({ error: "File not found!" });
                }
            });
        }

        // 7. Send file inline (view)
        return res.sendFile(filePath, (err) => {
            if (err && !res.headersSent) {
                return res.status(404).json({ error: "File not found!" });
            }
        });

    } catch (err) {
        console.log(err);
        next(err);
    }
};



export const deleteUserFile = async (req, res, next) => {
    const { fileid } = req.params;

    try {

        if (req.user.role !== 'Owner') {
            return res.status(403).json({ error: "Access denied" });
        }
        // 1. Check file exists in DB
        const file = await File.findById(fileid).lean();
        if (!file) {
            return res.status(404).json({ error: "File not found!" });
        }

        // 2. Check file owner
        const fileUser = await User.findById(file.userId).lean();
        if (!fileUser) {
            return res.status(404).json({ error: "File owner not found!" });
        }

        // 3. Check role permission
        const actingUser = req.user;
        const targetUserRank = ROLE_HIERARCHY.indexOf(fileUser.role);
        const actingUserRank = ROLE_HIERARCHY.indexOf(actingUser.role);

        if (actingUserRank < targetUserRank) {
            return res.status(403).json({ error: "Access denied" });
        }

        // 4. Build correct file path
        const filePath = path.join(
            projectRoot,
            "storage",
            `${fileid}${file.extension}`
        );

        // 5. Check if physical file exists
        try {
            await access(filePath, constants.F_OK);
        } catch {
            console.warn("File not found in disk but exists in DB:", filePath);
        }

        // 6. Delete from filesystem (safe)
        await rm(filePath, { force: true });

        // 7. Delete from DB
        await File.deleteOne({ _id: fileid });

        return res.status(200).json({ message: "File deleted successfully" });

    } catch (err) {
        next(err);
    }
};

export const renameUserFile = async (req, res, next) => {
    const { fileid } = req.params;
    const { newFilename } = req.body;


    try {
        if (req.user.role !== 'Owner') {
            return res.status(403).json({ error: "Access denied" });
        }
        // 1. Validate request
        if (!newFilename || typeof newFilename !== "string") {
            return res.status(400).json({ error: "New filename is required" });
        }

        // 2. Fetch file from DB
        const file = await File.findById(fileid).lean();
        if (!file) {
            return res.status(404).json({ error: "File not found!" });
        }

        // 3. Get file owner
        const fileUser = await User.findById(file.userId).lean();
        if (!fileUser) {
            return res.status(404).json({ error: "File owner not found!" });
        }

        // 4. Role hierarchy check
        const actingUser = req.user;
        const targetUserRank = ROLE_HIERARCHY.indexOf(fileUser.role);
        const actingUserRank = ROLE_HIERARCHY.indexOf(actingUser.role);

        if (actingUserRank < targetUserRank) {
            return res.status(403).json({ error: "Access denied" });
        }

        // 5. Update DB only (not touching physical file name)
        const updated = await File.findByIdAndUpdate(
            fileid,
            { name: newFilename },
            { new: true }
        ).lean();

        return res.status(200).json({
            message: "File renamed successfully",
            file: updated,
        });

    } catch (err) {
        next(err);
    }
};
