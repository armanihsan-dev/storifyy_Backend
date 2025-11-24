import express from 'express'
import checkAuth from '../middlewares/authMiddleware.js';
import { deleteFile, deleteSharedDirectory, getAllSharedDirectories, renameSharedDirectory, getSharedDirectoryContents, previewFile, renameFile, shareByEmail, shareDirectoryByEmail, sharedWithMe, getDirectoriesSharedByMe, revokeSharedDirectory } from '../controller/shareController.js';

const router = express.Router();


//file sharing
router.post("/:email", checkAuth, shareByEmail);
router.get("/shared-with-me", checkAuth, sharedWithMe);
router.get("/preview/:id", checkAuth, previewFile);
router.patch('/rename/:id', checkAuth, renameFile)
router.delete('/delete/:id', checkAuth, deleteFile)



//directory sharing
router.post('/directory/:email', checkAuth, shareDirectoryByEmail)
router.get('/getallsharedDirectories', checkAuth, getAllSharedDirectories)
router.get("/directories/:id", checkAuth, getSharedDirectoryContents);
router.delete('/deltesharedirectry/:dirId', checkAuth, deleteSharedDirectory)
router.patch('/renamedirectory/:dirId', checkAuth, renameSharedDirectory)
router.get('/getDirectoriesSharedByMe', checkAuth, getDirectoriesSharedByMe)
router.delete('/revokeSharedDirectory', checkAuth, revokeSharedDirectory)

export default router











