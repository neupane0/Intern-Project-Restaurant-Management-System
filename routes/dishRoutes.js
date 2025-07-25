// routes/dishRoutes.js
const express = require('express');
const router = express.Router();
const {
    createDish,
    getDishes,
    getDishById,
    updateDish,
    deleteDish,
    toggleDishAvailability, // <--- NEW: Import the new function
} = require('../controllers/dishController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const upload = require('../utils/upload');

// Base routes for dishes
router.route('/')
    .post(protect, authorizeRoles('admin', 'chef'), upload.single('image'), createDish)
    .get(getDishes);

// Routes for specific dish operations by ID
router.route('/:id')
    .get(getDishById)
    .put(protect, authorizeRoles('admin', 'chef'), upload.single('image'), updateDish)
    .delete(protect, authorizeRoles('admin', 'chef'), deleteDish);

// --- NEW ROUTE: Toggle Dish Availability ---
// PUT /api/dishes/:id/toggle-availability
// Accessible by 'admin' or 'chef' roles
router.put('/:id/toggle-availability', protect, authorizeRoles('admin', 'chef'), toggleDishAvailability);


module.exports = router;
