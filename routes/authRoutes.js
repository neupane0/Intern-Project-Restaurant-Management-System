// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { registerUser, authUser, forgotPassword, resetPassword } = require('../controllers/authController'); // Make sure all functions are imported

const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// // Only admin with token can register users
// router.post('/register', protect, authorizeRoles('admin'), registerUser);


// Public route for user registration
router.post('/register', registerUser);

// Public route for user login (authentication)
router.post('/login', authUser);

// Routes for Forgot Password feature
router.post('/forgotpassword', forgotPassword); // This is the one you just got working

// Route for Reset Password - Make sure this line is present and correct!
router.put('/resetpassword/:resettoken', resetPassword);

module.exports = router;