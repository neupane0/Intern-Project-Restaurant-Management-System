// routes/reservationRoutes.js
const express = require('express');
const router = express.Router();
const {
    createReservation,
    getReservations,
    getReservationById,
    updateReservationStatus,
    deleteReservation,
    getAvailableTables,
} = require('../controllers/reservationController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

// --- UPDATED ROUTE: Get Available Tables (Now Publicly Accessible) ---
// GET /api/reservations/available
// Accessible by ANY guest (no login required)
router.get('/available', getAvailableTables); // <--- MODIFIED: Removed 'protect' middleware


// Base routes for reservations
router.route('/')
    // POST /api/reservations: Create a new reservation
    // Accessible by 'admin', 'waiter', or 'user' (customer) roles
    .post(protect, authorizeRoles('admin', 'waiter', 'user'), createReservation)
    // GET /api/reservations: Get all reservations (Admin only)
    .get(protect, authorizeRoles('admin'), getReservations);

// Routes for specific reservation by ID (More general, so defined AFTER static paths)
router.route('/:id')
    .get(protect, authorizeRoles('admin'), getReservationById) // Get single reservation (Admin only)
    .delete(protect, authorizeRoles('admin'), deleteReservation); // Delete reservation (Admin only)

// Route to update reservation status (Admin only)
router.put('/:id/status', protect, authorizeRoles('admin'), updateReservationStatus);


module.exports = router;
