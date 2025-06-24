// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { authUser } = require('../controllers/authController');

router.post('/login', authUser);

module.exports = router;