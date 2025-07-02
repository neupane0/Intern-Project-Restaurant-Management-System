// routes/dishRoutes.js
const express = require('express');
const router = express.Router();
const {
    createDish,
    getDishes,
    getDishById,
    updateDish,
    deleteDish,
} = require('../controllers/dishController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const upload = require('../utils/upload'); // <--- NEW: Import the multer configuration

// Public route to get all dishes
// Protected routes for creating dishes (Admin/Chef only)
router.route('/')
    // POST /api/dishes: Create a new dish
    // Use upload.single('image') middleware to handle single file upload with field name 'image'
    .post(protect, authorizeRoles('admin', 'chef'), upload.single('image'), createDish) // <--- UPDATED
    .get(getDishes); // Anyone can view the menu (public) - adjust if you want it protected


// Routes for specific dish operations by ID
// Protected routes for updating/deleting dishes (Admin/Chef only)
router.route('/:id')
    .get(getDishById) // Anyone can view a single dish (public) - adjust if you want it protected
    // PUT /api/dishes/:id: Update a dish
    // Use upload.single('image') middleware here too for updating images
    .put(protect, authorizeRoles('admin', 'chef'), upload.single('image'), updateDish) // <--- UPDATED
    .delete(protect, authorizeRoles('admin', 'chef'), deleteDish); // Only Admin or Chef can delete dishes

module.exports = router;
