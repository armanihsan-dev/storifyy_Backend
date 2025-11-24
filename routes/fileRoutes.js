import express from "express";
import validateIdMiddleware from '../middlewares/validateIdMiddleware.js'
import { createFile, deleteFile, deleteUserFile, readFileById, readUserFile, renameFile, renameUserFile } from "../controller/fileController.js";
import checkAuth from "../middlewares/authMiddleware.js";
import { checkRole } from "../middlewares/checkRole.js";



const router = express.Router();



router.param('id', validateIdMiddleware)
router.param('parentDirId', validateIdMiddleware)

// CREATE 
router.post("/:parentDirId?", createFile);

// READ , RENAME AND DELETE
router.route("/:id").get(readFileById).patch(renameFile).delete(deleteFile);
router.get('/userFile/:fileid', checkAuth, checkRole, readUserFile)
router.get('/deleteUserFile/:fileid', checkAuth, checkRole, deleteUserFile)
router.post('/renameUserFile/:fileid', checkAuth, checkRole, renameUserFile)

export default router;
