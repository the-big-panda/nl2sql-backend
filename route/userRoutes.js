const express = require('express');
const { handleUserLogin, handleUserRegistration } = require('../controllers/userControllers/loginController');
const { db } = require('../util/setup-localdb');

const router = express.Router();

router.post('/login',handleUserLogin);

router.post('/register',handleUserRegistration );


module.exports = router;