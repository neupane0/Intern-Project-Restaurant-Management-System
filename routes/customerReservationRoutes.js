// routes/customerReservationRoutes.js
const express = require('express');
const router = express.Router();
const {
    createCustomerReservation,
    getCustomerReservations,
    getCustomerReservationById,
    updateCustomerReservation,
    cancelCustomerReservation,
    getCustomerAvailableTables,
} = require('../controllers/customerReservationController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// All customer reservation routes require authentication and customer role
router.use(protect);
router.use(authorizeRoles('customer'));

// Get available tables for customer
router.get('/available', getCustomerAvailableTables);

// Customer reservation routes
router.route('/')
    .post(createCustomerReservation) // Create new reservation
    .get(getCustomerReservations);   // Get customer's own reservations

// Routes for specific reservation by ID
router.route('/:id')
    .get(getCustomerReservationById)     // Get single reservation
    .put(updateCustomerReservation)      // Update reservation
    .delete(cancelCustomerReservation);  // Cancel reservation

module.exports = router; 