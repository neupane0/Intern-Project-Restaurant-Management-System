// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const {
    registerUser,
    getUsers,
    getUserById,
    updateUser,
    deleteUser
} = require('../controllers/userController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Admin routes for managing users
router.route('/')
    // .post(registerUser)
    .post(protect, authorizeRoles('admin'), registerUser)
    .get(protect, authorizeRoles('admin'), getUsers);

router.route('/:id')
    .get(protect, authorizeRoles('admin'), getUserById)
    .put(protect, authorizeRoles('admin'), updateUser)
    .delete(protect, authorizeRoles('admin'), deleteUser);

module.exports = router;