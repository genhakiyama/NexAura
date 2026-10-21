const Auth = require('../Controller/Auth');
const { authRateLimiter } = require('../Middleware/rateLimiter');
const isAuth = require('../Middleware/is-auth');
const express = require('express');

const router = express.Router();

router.post('/signup' , authRateLimiter , Auth.Signup);
router.post('/login' , authRateLimiter , Auth.LogIn);
router.post('/refresh' , Auth.RefreshAccessToken);
router.post('/logout' , Auth.LogOut);
router.post('/ws/ticket' , isAuth , Auth.GetWsTicket);
router.get('/verify-Email' , Auth.VerifyEmail);

module.exports = router;