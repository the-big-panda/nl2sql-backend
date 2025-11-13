const express = require('express');
const { handleAddWorkSpaces, handleGetWorkspaces, handleConnectWorkspaces, handleWorkspaceQuery } = require('../controllers/workspaceControllers/workspaceController');
const { authenticateToken } = require('../util/userAuth');

const router = express.Router()

router.post("/addWorkspaces",authenticateToken,handleAddWorkSpaces);
router.get("/getWorkspaces",authenticateToken,handleGetWorkspaces);
router.post("/connectWorkspace",authenticateToken,handleConnectWorkspaces);
router.post("/fetchQuery",authenticateToken,handleWorkspaceQuery);


module.exports = router;