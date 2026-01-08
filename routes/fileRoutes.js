import express from "express";
import validateIdMiddleware from '../middlewares/validateIdMiddleware.js'
import { deleteFile, deleteUserFile, readFileById, readUserFile, renameFile, renameUserFile, uploadComplete, uploadInitiate } from "../controller/fileController.js";
import checkAuth from "../middlewares/authMiddleware.js";
import { checkRole } from "../middlewares/checkRole.js";
import { requireActiveSubscription } from "../middlewares/subscription.js";



const router = express.Router();


router.post('/upload/initiate', checkAuth, requireActiveSubscription, uploadInitiate)
router.post('/upload/complete', checkAuth, requireActiveSubscription, uploadComplete)
router.param('id', validateIdMiddleware)
router.param('parentDirId', validateIdMiddleware)

// CREATE 
// create or uploading file is now handling by upload/initiate route. storing files in s3

// READ , RENAME AND DELETE
router.route("/:id").all(checkAuth, requireActiveSubscription).get(readFileById).patch(renameFile).delete(deleteFile);
router.get('/userFile/:fileid', checkAuth, checkRole, readUserFile)
router.get('/deleteUserFile/:fileid', checkAuth, checkRole, deleteUserFile)
router.post('/renameUserFile/:fileid', checkAuth, checkRole, renameUserFile)

export default router;
