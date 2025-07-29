// routes/reservationRoutes.js
const express = require('express');
const router = express.Router();
const {
    createReservation,
    getReservations,
    getReservationById,
    updateReservationStatus,
    deleteReservation,
} = require('../controllers/reservationController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// Base routes for reservations
router.route('/')
    .post(protect, authorizeRoles('admin'), createReservation) // Only Admin can create reservations
    .get(protect, authorizeRoles('admin'), getReservations); // Only Admin can view all reservations

// Routes for specific reservation by ID
router.route('/:id')
    .get(protect, authorizeRoles('admin'), getReservationById) // Get single reservation
    .delete(protect, authorizeRoles('admin'), deleteReservation); // Delete reservation

// Route to update reservation status
router.put('/:id/status', protect, authorizeRoles('admin'), updateReservationStatus);


module.exports = router;
