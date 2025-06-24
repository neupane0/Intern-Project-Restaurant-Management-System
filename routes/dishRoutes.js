// routes/dishRoutes.js
const express = require('express');
const router = express.Router();
const {
    addDish,
    getDishes,
    getDishById,
    updateDish,
    deleteDish
} = require('../controllers/dishController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.route('/')
    .post(protect, authorizeRoles('chef', 'admin'), addDish)
    .get(protect, getDishes); // Or make it public if you want menu without login

router.route('/:id')
    .get(protect, getDishById) // Or public
    .put(protect, authorizeRoles('chef', 'admin'), updateDish)
    .delete(protect, authorizeRoles('chef', 'admin'), deleteDish);

module.exports = router;