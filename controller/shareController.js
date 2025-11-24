import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, "..");
import path from "path";
import fs from "fs/promises";
import Share from "../models/shareModel.js";
import File from "../models/fileModel.js";
import User from "../models/userModel.js";
import Directory from './../models/directoryModel.js';
import DirectoryShare from './../models/directoryShareModel.js';


export async function isDirAccessible(dirId, userId) {
    if (!dirId) return false;

    // 1. Direct share
    const shared = await DirectoryShare.findOne({
        directoryId: dirId,
        sharedUserId: userId
    });

    if (shared) return true;

    // 2. Fetch directory
    const dir = await Directory.findById(dirId);
    if (!dir || !dir.parentDirId) return false;

    // 3. Check parent recursively
    return await isDirAccessible(dir.parentDirId, userId);
}

//file sharing
export const previewFile = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        // 1️⃣ Find file
        const fileData = await File.findById(id).lean();
        if (!fileData) {
            return res.status(404).json({ error: "File not found!" });
        }

        // 2️⃣ Check ownership
        const isOwner = fileData.userId.toString() === userId.toString();
        let hasAccess = isOwner;

        // 3️⃣ If not owner → check file share or inherited shared directory
        if (!isOwner) {
            const fileShare = await Share.findOne({
                fileId: id,
                userId,
            }).lean();

            const inheritedAccess = await isDirAccessible(fileData.parentDirId, userId);

            if (fileShare || inheritedAccess)
                hasAccess = true;
        }

        // 4️⃣ App owner always allowed
        if (req.user.role === "Owner") hasAccess = true;

        // 5️⃣ Final block
        if (!hasAccess) {
            return res.status(403).json({
                error: "You do not have permission to preview this file!",
            });
        }

        // 6️⃣ File path
        const filePath = `${projectRoot}/storage/${id}${fileData.extension}`;

        // 7️⃣ Handle download
        if (req.query.action === "download") {
            return res.download(filePath, fileData.name);
        }

        // 8️⃣ Preview
        return res.sendFile(filePath, (err) => {
            if (!res.headersSent && err) {
                return res.status(404).json({ error: "File not found!" });
            }
        });

    } catch (error) {
        console.log(error);
        next(error);
    }
};

export const renameFile = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { newName } = req.body;
        const userId = req.user._id;

        // 1️⃣ Validate name
        if (!newName || newName.trim().length < 1) {
            return res.status(400).json({ error: "New name is required." });
        }

        let safeName = newName.trim();
        console.log(safeName);

        // 2️⃣ Find file
        const file = await File.findById(id);
        safeName = `${newName.trim()}${file.extension}`
        if (!file) {
            return res.status(404).json({ error: "File not found!" });
        }
        const isParendDirectoryShared = await DirectoryShare.findOne({ directoryId: fileData.parentDirId }).lean()
        // 3️⃣ Check ownership
        const isOwner = file.userId.toString() === userId.toString();

        // 4️⃣ If not owner → check if shared with them & role = editor
        let hasAccess = isOwner;

        if (!isOwner) {
            const shared = await Share.findOne({ fileId: id, userId: userId }).lean();
            if (shared && shared.role === "editor") {
                hasAccess = true;
            }
        }

        //check if requesting role is application owner
        if (req.user.role === 'Owner') {
            hasAccess = true
        }
        // 5️⃣ Final permission check
        if (!hasAccess) {
            return res.status(403).json({
                error: "You do not have permission to rename this file.",
            });
        }

        // 6️⃣ Update file name
        file.name = safeName;
        await file.save();

        return res.status(200).json({
            message: "File renamed successfully",
            file,
        });
    } catch (err) {
        console.error(err);
        next(err);
    }
};

export const deleteFile = async (req, res) => {
    const session = await File.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const userId = req.user._id;

        const fileData = await File.findById(id).session(session);
        if (!fileData) {
            return res.status(404).json({ error: "File not found" });
        }

        const isOwner = fileData.userId.toString() === userId.toString();
        let hasAccess = isOwner;

        // Shared deletion needs editor role
        if (!isOwner) {
            const shared = await Share.findOne({
                fileId: id,
                userId
            }).lean();

            const inheritedAccess = await isDirAccessible(fileData.parentDirId, userId);

            if ((shared?.role === "editor") || inheritedAccess)
                hasAccess = true;
        }

        if (req.user.role === "Owner") hasAccess = true;

        if (!hasAccess) {
            return res.status(403).json({
                error: "You do not have permission to delete this file.",
            });
        }

        // Delete from disk
        const filePath = path.join("storage", `${id}${fileData.extension}`);
        try {
            await fs.unlink(filePath);
        } catch (err) {
            console.warn("⚠ File missing on disk:", err.message);
        }

        // Delete shares & file
        await Share.deleteMany({ fileId: id }).session(session);
        await File.deleteOne({ _id: id }).session(session);

        await session.commitTransaction();
        session.endSession();

        return res.json({ message: "File deleted successfully" });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error(err);

        return res.status(500).json({
            error: "Failed to delete file",
            details: err.message,
        });
    }
};

export const shareByEmail = async (req, res) => {
    try {

        const { fileid, role } = req.body
        const email = req.params.email
        const user = req.user

        const file = await File.findById(fileid)
        if (!file) {
            return res.status(404).json({ error: "File not found" });
        }
        // 3. See if target user exists
        const targetUser = await User.findOne({ email });
        if (!targetUser) {
            return res.status(404).json({ error: "Target user not found" });
        }
        const shareEntry = await Share.create({
            fileId: file._id,
            userId: targetUser._id,
            email,
            role,
        });
        file.sharedWith = shareEntry._id
        await file.save()
        res.status(201).json({
            message: "File shared successfully",
            share: shareEntry
        });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: err.message });
    }
};


// this Control and will return all the files that are shared with him
export const sharedWithMe = async (req, res) => {
    try {
        const userId = req.user._id;

        // 1. Find all share entries for this user
        const shares = await Share.find({ userId }).lean();

        if (!shares.length) {
            return res.status(200).json({ files: [] });
        }

        // 2. Extract file IDs
        const fileIds = shares.map((s) => s.fileId);
        // 3. Fetch real file docs
        const files = await File.find({ _id: { $in: fileIds } }).lean();
        // 4. Prepare response
        const combined = files.map((file) => {
            const shareInfo = shares.find((s) => s.fileId.toString() === file._id.toString());
            return {
                ...file,
                id: file._id,
                sharedRole: shareInfo.role,
                sharedAt: shareInfo.createdAt,
            };
        });

        return res.status(200).json({ files: combined });

    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to fetch shared files" });
    }
};


//directory sharing
export const shareDirectoryByEmail = async (req, res) => {
    const session = await DirectoryShare.startSession()
    session.startTransaction();
    try {
        const { email } = req.params
        const { directoryId, role } = req.body
        const user = req.user

        const directory = await Directory.findById(directoryId).session(session)
        if (!directory) {
            await session.abortTransaction();
            return res.status(404).json({ error: "Directory not found" });
        }
        // 3. See if target user exists
        const targetUser = await User.findOne({ email }).session(session)
        if (!targetUser) {
            await session.abortTransaction();
            return res.status(404).json({ error: "Target user not found" });
        }

        const shareEntry = await DirectoryShare.create(
            [{
                directoryId,
                sharedUserId: targetUser._id,
                sharedUserEmail: email,
                accessType: role,
                sharedBy: user._id
            }],
            { session }
        );
        directory.sharedWith = shareEntry[0]._id;
        await directory.save({ session });

        await session.commitTransaction();
        session.endSession();
        res.status(201).json({
            message: "Directory shared successfully",
            share: shareEntry
        });

    } catch (er) {
        console.log(er);
        res.status(500).json({ error: er.message });
    }
}

//this will return the directories which has been shared by another with requesting user
export const getAllSharedDirectories = async (req, res) => {
    try {
        const userId = req.user._id;
        // 1. Find all shared directory entries for this user
        const shares = await DirectoryShare.find({ sharedUserId: userId }).lean();
        if (!shares.length) {
            return res.status(200).json({ directories: [] });
        }
        //extract only the ids from the shared directories
        const sharedDirIds = shares.map((sharedDirectory) => sharedDirectory.directoryId)
        // find real directories
        const directories = await Directory.find({ _id: { $in: sharedDirIds } }).lean()


        // 4. Prepare response
        const combined = directories.map((directory) => {
            const shareInfo = shares.find((s) => s.directoryId.toString() === directory._id.toString());
            return {
                ...directory,
                id: directory._id,
                sharedRole: shareInfo.accessType,
                sharedAt: shareInfo.createdAt,
            };
        });
        return res.status(200).json({ directories: combined });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Failed to fetch shared directories" });
    }
}


export const getSharedDirectoryContents = async (req, res) => {
    try {
        const directoryId = req.params.id;
        const userId = req.user._id;

        // Check if this directory is shared with this user
        // Recursively check if any parent directory is shared with the user
        async function isDirAccessible(dirId, userId) {
            // Direct share check
            const shared = await DirectoryShare.findOne({
                directoryId: dirId,
                sharedUserId: userId
            });

            if (shared) return true;

            // Load the directory
            const dir = await Directory.findById(dirId);
            if (!dir || !dir.parentDirId) return false;

            // Check parent directory recursively
            return await isDirAccessible(dir.parentDirId, userId);
        }

        // Get the directory
        const directory = await Directory.findById(directoryId);

        if (!directory) {
            return res.status(404).json({ error: "Directory not found" });
        }

        // Get children
        const childDirs = await Directory.find({ parentDirId: directoryId });
        const childFiles = await File.find({ parentDirId: directoryId });


        return res.json({
            directory,
            childDirs: childDirs || [],
            childFiles: childFiles || []
        });


    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Something went wrong" });
    }
};


export const deleteSharedDirectory = async (req, res) => {
    try {
        const { dirId } = req.params;
        const userId = req.user._id;

        // 1️⃣ Check if directory exists
        const dir = await Directory.findById(dirId);
        if (!dir) {
            return res.status(404).json({ error: "Directory not found" });
        }

        // 2️⃣ Find shared entry FOR THIS USER ONLY
        const shareEntry = await DirectoryShare.findOne({
            directoryId: dirId,
            sharedUserId: userId     // <-- Correct field
        });

        if (!shareEntry) {
            return res.status(403).json({
                error: "You do not have shared access to this directory."
            });
        }
        if (shareEntry.accessType !== 'editor') {
            return res.status(403).json({ error: "You don't have delete permission." })
        }

        // 3️⃣ Remove ONLY this user's share entry (not others)
        await DirectoryShare.deleteOne({
            directoryId: dirId,
            sharedUserId: userId
        });

        return res.status(200).json({
            message: "You have been removed from this shared directory"
        });

    } catch (err) {
        console.log(err);
        return res.status(500).json({ error: "Something went wrong" });
    }
};


export const renameSharedDirectory = async (req, res) => {
    try {
        const { dirId } = req.params;
        const userId = req.user._id;
        const { newName } = req.body;

        // 1️⃣ Validate name
        if (!newName || newName.trim().length < 1) {
            return res.status(400).json({ error: "New name is required." });
        }
        console.log(dirId);
        // 2️⃣ Find directory
        const directory = await Directory.findById(dirId);
        if (!directory) {
            return res.status(404).json({ error: "Directory not found" });
        }

        // 3️⃣ Check if requester is the directory owner
        const isOwner = directory.userId.toString() === userId.toString();
        if (isOwner) {
            directory.name = newName.trim();
            await directory.save();
            return res.status(200).json({
                message: "Directory renamed successfully",
                directory
            });
        }

        // 4️⃣ Check if requester has shared access
        const shareEntry = await DirectoryShare.findOne({
            directoryId: dirId,
            sharedUserId: userId,     // <-- CORRECT FIELD
        }).lean();

        if (!shareEntry) {
            return res.status(403).json({ error: "You do not have access to this directory." });
        }

        // 5️⃣ Check Editor role
        if (shareEntry.accessType !== "editor") {
            return res.status(403).json({
                error: "You do not have permission to rename this directory."
            });
        }

        // 6️⃣ Super Admin override
        if (req.user.role === "Owner") {
            directory.name = newName.trim();
            await directory.save();
            return res.status(200).json({
                message: "Directory renamed successfully (admin override)",
                directory
            });
        }

        // 7️⃣ Editor-level rename
        directory.name = newName.trim();
        await directory.save();

        return res.status(200).json({
            message: "Directory renamed successfully",
            directory
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: "Something went wrong" });
    }
};

export const getDirectoriesSharedByMe = async (req, res) => {
    try {
        const user = req.user;

        // 1. Get all share entries where logged-in user is the owner (= sharedBy)
        const sharedEntries = await DirectoryShare.find({
            sharedBy: user._id
        }).lean();

        if (sharedEntries.length === 0) {
            return res.status(200).json({ directories: [] });
        }

        // Extract all directoryIds to fetch directory metadata
        const directoryIds = [...new Set(sharedEntries.map(e => e.directoryId))];

        // 2. Fetch directory details
        const directories = await Directory.find({ _id: { $in: directoryIds } })
            .lean();

        // 3. Fetch all users involved (to get names)
        const allUserEmails = [...new Set(sharedEntries.map(e => e.sharedUserEmail))];
        const users = await User.find({ email: { $in: allUserEmails } })
            .select("name email")
            .lean();

        // Build map for quick lookup
        const userMap = {};
        users.forEach(u => userMap[u.email] = u);

        // 4. Combine data
        const response = directories.map(dir => {
            const shareDetails = sharedEntries
                .filter(entry => entry.directoryId.toString() === dir._id.toString())
                .map(entry => ({
                    sharedWith: entry.sharedUserEmail,
                    name: userMap[entry.sharedUserEmail]?.name || "Unknown User",
                    accessType: entry.accessType,
                    sharedAt: entry.sharedAt
                }));

            return {
                directoryId: dir._id,
                name: dir.name,
                owner: dir.ownerEmail,
                sharedWith: shareDetails
            };
        });

        res.status(200).json({ directories: response });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
    }
};

export const revokeSharedDirectory = async (req, res) => {
    try {
        const { dirId, email } = req.body;
        const user = req.user;

        if (!dirId || !email) {
            return res.status(400).json({ error: "dirId and email are required" });
        }

        // 1️⃣ Find share entry
        const shareEntry = await DirectoryShare.findOne({
            directoryId: dirId,
            sharedBy: user._id,            // ensures user is the one who shared it
            sharedUserEmail: email,
        });

        // 2️⃣ Prevent invalid revokes
        if (!shareEntry) {
            return res.status(404).json({ error: "Share entry not found!" });
        }

        // 3️⃣ Cannot revoke yourself accidentally
        if (email === user.email) {
            return res.status(400).json({ error: "You cannot revoke your own access!" });
        }

        // 4️⃣ Delete share entry
        await shareEntry.deleteOne();

        return res.status(200).json({ message: "Access revoked successfully!" });

    } catch (err) {
        console.log("Revoke Error:", err);
        return res.status(500).json({ error: "Something went wrong" });
    }
};
