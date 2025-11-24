
import { rm } from 'fs/promises';
import { ObjectId } from 'mongodb';
import Directory from './../models/directoryModel.js';
import File from './../models/fileModel.js';
import mongoose from 'mongoose';
import DirectoryShare from '../models/directoryShareModel.js';


export const getDirectory = async (req, res) => {
    const user = req.user;
    const _id = req.params.id || user.rootDirId.toString();
    const directoryData = await Directory.findOne({ _id }).lean()
    if (!directoryData) {
        return res
            .status(404)
            .json({ error: "Directory not found or you do not have access to it!" });
    }
    const files = await File.find({ parentDirId: directoryData._id }).lean()
    const directories = await Directory.find({ parentDirId: _id }).lean();

    return res.status(200).json({
        ...directoryData,
        files: files.map((file) => ({ ...file, id: file._id })),
        directories: directories.map((dir) => ({ ...dir, id: dir._id })),
    });
}

export const createDirectory = async (req, res, next) => {
    const user = req.user;
    const parentDirId = req.params.parentDirId
        ? req.params.parentDirId
        : user.rootDirId.toString();
    const dirname = req.headers.foldername || "New Folder";
    try {
        const parentDir = await Directory.findOne({
            _id: parentDirId,
        }).lean();

        if (!parentDir)
            return res
                .status(404)
                .json({ message: "Parent Directory Does not exist!" });

        await Directory.insertOne({
            name: dirname,
            parentDirId,
            userId: user._id,
        });

        return res.status(200).json({ message: "Directory Created!" });
    } catch (err) {
        next(err);
    }
}

export const renameDirectory = async (req, res, next) => {
    const user = req.user
    const { id } = req.params;
    const { newDirName } = req.body;
    try {
        await Directory.findOneAndUpdate({
            _id: id,
            userId: user._id
        }, { $set: { name: newDirName } });
        res.status(200).json({ message: "Directory Renamed!" });
    } catch (err) {
        next(err);
    }
}

export const deleteDirectory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const DirObjId = new ObjectId(id);

        const directoryData = await Directory.findOne({
            _id: DirObjId,
            userId: req.user._id,
        }).select("_id");

        if (!directoryData) {
            return res
                .status(404)
                .json({ message: "Directory not found or you don't have access to it." });
        }

        // Recursive function
        async function getDirectoryContent(id) {
            const directories = await Directory.find({ parentDirId: id })
                .select("_id name")
                .lean();
            const files = await File.find({ parentDirId: id })
                .select("_id extension")
                .lean();

            let allDirs = [...directories];
            let allFiles = [...files];

            for (const dir of directories) {
                const { files: childFiles, directories: childDirectories } =
                    await getDirectoryContent(dir._id);
                allDirs.push(...childDirectories);
                allFiles.push(...childFiles);
            }

            return { files: allFiles, directories: allDirs };
        }

        const { files, directories } = await getDirectoryContent(DirObjId);

        // Delete files from filesystem and DB
        for (const file of files) {
            try {
                await rm(`./storage/${file._id.toString()}${file.extension}`);
            } catch (err) {
                console.warn("Failed to remove file:", file._id, err.message);
            }
        }

        await File.deleteMany({ _id: { $in: files.map((f) => f._id) } });
        await Directory.deleteMany({
            _id: { $in: [...directories.map((d) => d._id), DirObjId] },
        });
        const checkIfShared = await DirectoryShare.findOne({ directoryId: id, sharedBy: req.user._id })
        if (checkIfShared) {
            await checkIfShared.deleteOne()
        }

        return res.status(200).json({ message: "Directory deleted successfully" });
    } catch (error) {
        console.error("Delete directory error:", error);
        next(error)
        return res
            .status(500)
            .json({ message: "Failed to delete directory", error: error.message });
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