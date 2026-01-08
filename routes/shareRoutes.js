import express from 'express'
import checkAuth from '../middlewares/authMiddleware.js';
import { deleteFile, deleteSharedDirectory, getAllSharedDirectories, renameSharedDirectory, getSharedDirectoryContents, previewFile, renameFile, shareByEmail, shareDirectoryByEmail, sharedWithMe, getDirectoriesSharedByMe, revokeSharedDirectory, getFilesSharedByMe, revokeFileShare } from '../controller/shareController.js';
import { requireActiveSubscription } from '../middlewares/subscription.js';

const router = express.Router();


//file sharing
router.post("/:email", checkAuth, requireActiveSubscription, shareByEmail);
router.get("/shared-with-me", checkAuth, requireActiveSubscription, sharedWithMe);
router.get("/preview/:id", checkAuth, requireActiveSubscription, previewFile);
router.patch("/rename/:id", checkAuth, requireActiveSubscription, renameFile);
router.delete("/delete/:id", checkAuth, requireActiveSubscription, deleteFile);




//directory sharing
router.post('/directory/:email', checkAuth, requireActiveSubscription, shareDirectoryByEmail)
router.get('/getallsharedDirectories', checkAuth, requireActiveSubscription, getAllSharedDirectories)
router.get("/directories/:id", checkAuth, requireActiveSubscription, getSharedDirectoryContents);
router.delete('/deltesharedirectry/:dirId', checkAuth, requireActiveSubscription, deleteSharedDirectory)
router.patch('/renamedirectory/:dirId', checkAuth, requireActiveSubscription, renameSharedDirectory)
router.get('/getDirectoriesSharedByMe', checkAuth, requireActiveSubscription, getDirectoriesSharedByMe)
router.delete('/revokeSharedDirectory', checkAuth, requireActiveSubscription, revokeSharedDirectory)
router.delete('/revokeSharedFile', checkAuth, requireActiveSubscription, revokeFileShare)
router.get('/getFilesSharedByMe', checkAuth, requireActiveSubscription, getFilesSharedByMe)

export default router











