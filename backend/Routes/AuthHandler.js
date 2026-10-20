const Auth = require('../Controller/Auth');
const express = require('express');

const router = express.Router();

router.post('/signup' , Auth.Signup);
router.post('/login' , Auth.LogIn);
router.get('/verify-Email' , Auth.VerifyEmail);

module.exports = router;