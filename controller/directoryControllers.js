
import { rm } from 'fs/promises';
import { ObjectId } from 'mongodb';
import Directory from './../models/directoryModel.js';
import File from './../models/fileModel.js';
import mongoose from 'mongoose';
import DirectoryShare from '../models/directoryShareModel.js';
import { purify } from './../config/dom-purify.js';
import { updateParentDirectorySize } from './fileController.js';
import { deleteS3Objects } from '../config/s3.js';


export const getDirectory = async (req, res) => {
    const user = req.user;
    const _id = req.params.id || user.rootDirId.toString();

    const directory = await Directory.findOne({ _id, userId: user._id }).lean();
    if (!directory) {
        return res.status(404).json({
            error: "Directory not found or you do not have access!",
        });
    }

    const files = await File.find({ parentDirId: _id }).lean();
    const directories = await Directory.find({ parentDirId: _id }).lean();

    // ⭐ Sort: starred items come first
    directories.sort((a, b) => Number(b.isStarred) - Number(a.isStarred));

    return res.status(200).json({
        ...directory,
        files: files.map(f => ({ ...f, id: f._id })),
        directories: directories.map(d => ({ ...d, id: d._id })),
    });
};


export const createDirectory = async (req, res, next) => {
    try {
        const user = req.user;
        const dirname = purify.sanitize(req.headers.foldername) || "New Folder";

        const parentDirId = req.params.parentDirId
            ? req.params.parentDirId
            : user.rootDirId.toString();

        const parentDir = await Directory.findById(parentDirId);
        if (!parentDir) {
            return res.status(404).json({ message: "Parent directory not found!" });
        }

        const newPath = [...parentDir.path, parentDir._id];

        const newDir = await Directory.create({
            name: dirname,
            parentDirId,
            userId: user._id,
            path: newPath,
            size: 0,
        });

        return res.status(201).json({
            message: "Directory created!",
            directory: {
                id: newDir._id,
                name: newDir.name,
                parentDirId: newDir.parentDirId,
                path: newDir.path,
            },
        });

    } catch (error) {
        next(error);
    }
};


export const getBreadcrumb = async (req, res, next) => {
    try {
        const { dirId } = req.params;

        let current = await Directory.findById(dirId).lean();
        if (!current)
            return res.status(404).json({ message: "Directory not found" });

        const breadcrumb = [];

        // Walk upward through parents
        while (current) {
            breadcrumb.push({
                _id: current._id,
                name: current.name,
            });

            if (!current.parentDirId) break;

            current = await Directory.findById(current.parentDirId).lean();
        }

        // Reverse to make order: root → → current
        breadcrumb.reverse();

        return res.json(breadcrumb);

    } catch (err) {
        next(err);
    }
};

    


export const renameDirectory = async (req, res, next) => {
    try {
        const user = req.user;
        const { id } = req.params;
        const newDirName = purify.sanitize(req.body.newDirName);

        await Directory.findOneAndUpdate(
            { _id: id, userId: user._id },
            { $set: { name: newDirName } }
        );

        return res.status(200).json({ message: "Directory renamed!" });

    } catch (err) {
        next(err);
    }
};


export const deleteDirectory = async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { id } = req.params;
        const dirId = new ObjectId(id);

        const directoryData = await Directory.findOne({
            _id: dirId,
            userId: req.user._id,
        }).session(session);

        if (!directoryData) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Directory not found" });
        }

        // Recursive helper to collect all children
        async function getContent(id) {
            const dirs = await Directory.find({ parentDirId: id })
                .select("_id size")
                .session(session)
                .lean();

            const files = await File.find({ parentDirId: id })
                .select("_id size extension")
                .session(session)
                .lean();

            let totalDirs = [...dirs];
            let totalFiles = [...files];
            let totalSize = files.reduce((sum, f) => sum + f.size, 0);

            for (const d of dirs) {
                const child = await getContent(d._id);
                totalDirs.push(...child.directories);
                totalFiles.push(...child.files);
                totalSize += child.totalSize + d.size;
            }

            return { directories: totalDirs, files: totalFiles, totalSize };
        }

        const { directories, files, totalSize } = await getContent(dirId);

        const totalDeletedSize = totalSize + directoryData.size;

        // Delete physical files from s3
        const keys = files.map(({ _id, extension }) => ({ Key: `${_id}${extension}` }))
        await deleteS3Objects(keys)
        // Delete documents
        await File.deleteMany({ _id: { $in: files.map(f => f._id) } })
            .session(session);

        await DirectoryShare.deleteMany({
            directoryId: { $in: [...directories.map(d => d._id), dirId] }
        }).session(session);

        await Directory.deleteMany({
            _id: { $in: [...directories.map(d => d._id), dirId] }
        }).session(session);

        // Decrease cumulative size from parent dir
        if (directoryData.parentDirId) {
            await updateParentDirectorySize(
                directoryData.parentDirId,
                -totalDeletedSize,
                session
            );
        }

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({ message: "Directory deleted successfully" });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        next(error);
    }
};



export const deleteUserDirectory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { targetuserid } = req.body
        const DirObjId = new mongoose.Types.ObjectId(id);
        // Check ownership  
        const directoryExists = await Directory.findOne({
            _id: DirObjId,
            userId: targetuserid

        }).select("_id");

        const isOwner = req.user.role === "Owner";
        const isAdminOwnData = req.user.role === "Admin" && req.user._id.toString() === targetuserid;

        if (!isOwner && !isAdminOwnData) {
            return res.status(403).json({
                message: "Forbidden: You don't have permission to delete this directory."
            });
        }
        if (!directoryExists) {
            return res.status(404).json({
                message: "Directory not found or you don't have access to it."
            });
        }

        // 🔁 Recursive collector
        async function collectChildren(dirId) {
            const childDirs = await Directory.find({ parentDirId: dirId })
                .select("_id")
                .lean();

            const childFiles = await File.find({ parentDirId: dirId })
                .select("_id extension")
                .lean();

            let allDirs = [...childDirs];
            let allFiles = [...childFiles];

            for (const child of childDirs) {
                const { directories, files } = await collectChildren(child._id);
                allDirs.push(...directories);
                allFiles.push(...files);
            }

            return { directories: allDirs, files: allFiles };
        }

        const { directories, files } = await collectChildren(DirObjId);

        // 🗑️ FS delete files
        for (const file of files) {
            try {
                await rm(`./storage/${file._id}${file.extension}`, { force: true });
            } catch (error) {
                console.warn("Cannot delete file:", file._id, error.message);
            }
        }

        // 🗑️ Delete files from DB
        await File.deleteMany({ _id: { $in: files.map((f) => f._id) } });

        // 🗑️ Delete directories (children + itself)
        await Directory.deleteMany({
            _id: { $in: [...directories.map((d) => d._id), DirObjId] }
        });

        return res.status(200).json({
            message: "Directory deleted successfully!"
        });
    } catch (error) {
        console.error("Delete directory error:", error);
        next(error);
        return res.status(500).json({
            message: "Failed to delete directory",
            error: error.message
        });
    }
}


export const toggleStar = async (req, res, next) => {
    try {
        const { dirId } = req.params;

        const dir = await Directory.findOne({
            _id: dirId,
            userId: req.user._id,
        });

        if (!dir) return res.status(404).json({ error: "Directory not found" });

        dir.isStarred = !dir.isStarred;
        await dir.save();

        res.json({
            message: `Directory ${dir.isStarred ? "starred" : "unstarred"} successfully`,
            isStarred: dir.isStarred
        });
    } catch (e) {
        console.log('cannot make dir start', e);
        next(e)
    }
};

export const getStarredDirectories = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const directories = await Directory.find({
            userId,
            isStarred: true
        }).lean();

        return res.json({
            directories: directories.map(d => ({ ...d, id: d._id }))
        });

    } catch (err) {
        console.error('error getting starred directories', err);
        next(err);
    }
};

