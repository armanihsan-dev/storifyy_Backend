
import { rm } from 'fs/promises';
import path from "path";
import mongoose from 'mongoose';
import { fileURLToPath } from "url";
import Directory from './../models/directoryModel.js';
import fs from 'fs/promises'
import File from './../models/fileModel.js';
import User from '../models/userModel.js';
import { ROLE_HIERARCHY } from './userController.js';
import Share from '../models/shareModel.js';
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, "..");
import { createGetSignedURL, createUploadSignedURL, deleteS3Object, getS3ObjectMetaData } from '../config/s3.js'



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

export const deleteFile = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;

        // Fetch file document
        const fileData = await File.findById(id).session(session);
        if (!fileData) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ error: "File not found!" });
        }

        const fileSize = fileData.size;

        //Verify parent directory belongs to the user
        let parentDir = await Directory.findOne({
            _id: fileData.parentDirId,
            userId: req.user._id
        }).session(session);

        if (!parentDir) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ error: "Parent directory not found!" });
        }

        //Remove file from s3 
        const fileKey = path.join(`${id}${fileData.extension}`);
        try {
            await deleteS3Object(fileKey)
        } catch (err) {
            console.warn("File missing on s3, continuing:", err.message);
        }

        // Remove shares
        await Share.deleteMany({ fileId: id }).session(session);

        //Delete file from DB
        await File.deleteOne({ _id: id }).session(session);

        //Decrease sizes from all parent directories (recursive upward update)
        await updateParentDirectorySize(parentDir._id, -fileSize, session);


        //Commit transaction
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
            const fileSignedURL = await createGetSignedURL({ key: `${id}${fileData.extension}`, download: true, fileName: fileData.name })
            return res.redirect(fileSignedURL)
        }

        // Send file
        return res.sendFile(`${filePath}`, async (err) => {
            if (!res.headersSent && err) {
                const fileSignedURL = await createGetSignedURL({ key: `${id}${fileData.extension}`, fileName: fileData.name })
                return res.redirect(fileSignedURL)
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


export const uploadInitiate = async (req, res, next) => {
    try {
        const parentDirId = req.body.parentDirId || req.user.rootDirId;

        const parentDirData = await Directory.findOne({
            _id: parentDirId,
            userId: req.user._id,
        });

        const userDocument = await User.findById(req.user._id);

        if (!parentDirData) {
            return res.status(404).json({ error: "Parent directory not found!" });
        }

        // Incoming file info from headers
        const fileSize = Number(req.body.size) || 0;
        const filename = req.body.name || "untitled";
        const extension = path.extname(filename) || req.body.contentType;

        // Hard max per-file upload (optional)
        const MAX_FILE_SIZE = userDocument.maxUploadBytes; // 100MB
        if (fileSize > MAX_FILE_SIZE) {
            req.destroy();
            return res.status(507).json({ error: "File size exceeds 100MB limit." });
        }

        // STORAGE LIMIT VALIDATION
        const currentUsed = parentDirData.size; // root size tracks total storage
        const maxAllowed = userDocument.maxStorageInBytes;

        const availableSpace = maxAllowed - currentUsed;

        //  Reject if file is larger than available space
        if (fileSize > availableSpace) {
            req.destroy();
            return res.status(507).json({
                error: `Not enough storage. Available: ${availableSpace} bytes`,
            });
        }

        // INSERT FILE RECORD
        const insertedFile = await File.insertOne({
            extension,
            size: fileSize,
            name: filename,
            parentDirId: parentDirData._id,
            userId: req.user._id,
            isUploading: true
        });
        const fileID = insertedFile.id;

        const uploadSignedURL = await createUploadSignedURL({ key: `${fileID}${extension}`, contentType: req.body.contentType })

        res.json({ uploadSignedURL, fileID })
    } catch (err) {
        //store error to local file using writefile
        const errorString = err.toString();
        await fs.writeFile('newfile.txt', errorString);
        console.log(err);
        next(err)
    }

}

export const uploadComplete = async (req, res, next) => {
    try {
        const fileId = req.body.fileID
        // 1️⃣ Fetch file
        const file = await File.findById(fileId)
        if (!file) {
            return res.status(404).json({ error: "File not found!" })
        }

        // 2️⃣ Get S3 metadata
        const s3ObjectMedaData = await getS3ObjectMetaData(
            `${file._id}${file.extension}`
        )

        // 3️⃣ Validate file size
        if (s3ObjectMedaData.ContentLength !== file.size) {
            await file.deleteOne()
            return res.status(404).json({ error: "File size does not match." })
        }

        // 4️⃣ Mark upload complete
        file.isUploading = false
        await file.save()

        // 5️⃣ Update parent directory size
        await updateParentDirectorySize(file.parentDirId, file.size)

        // 6️⃣ Success response
        return res.json({ message: "upload completed" })

    } catch (err) {
        // S3 failure OR unexpected error
        console.log(err);
        try {
            if (err) {
                const fileId = req.body.fileID
                const file = await File.findById(fileId)
                if (file) await file.deleteOne()
            }
        } catch (_) {
            // ignore cleanup error
        }

        return res
            .status(404)
            .json({ error: "File was could not be uploaded properly." })
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


