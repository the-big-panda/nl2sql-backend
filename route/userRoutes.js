const express = require('express');
const { handleUserLogin } = require('../controllers/userControllers/loginController');

const router = express.Router();

router.post('/login',handleUserLogin);

module.exports = router;