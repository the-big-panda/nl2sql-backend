const express = require('express');
const { handleAddWorkSpaces, handleGetWorkspaces } = require('../controllers/workspaceControllers/workspaceController');
const { authenticateToken } = require('../util/userAuth');

const router = express.Router()

router.post("/addWorkspaces",authenticateToken,handleAddWorkSpaces)
router.get("/getWorkspaces",authenticateToken,handleGetWorkspaces);


module.exports = router;