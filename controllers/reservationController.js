// controllers/reservationController.js
const asyncHandler = require('express-async-handler');
const Reservation = require('../models/Reservation');

// @desc    Create a new table reservation
// @route   POST /api/reservations
// @access  Private/Admin
const createReservation = asyncHandler(async (req, res) => {
    const { tableNumber, customerName, customerPhoneNumber, numberOfGuests, reservationTime, notes } = req.body;

    // Basic input validation
    if (!tableNumber || !customerName || !customerPhoneNumber || !numberOfGuests || !reservationTime) {
        res.status(400);
        throw new Error('Please fill all required reservation fields: table number, customer name, phone number, number of guests, and reservation time.');
    }

    // Validate number of guests
    if (typeof numberOfGuests !== 'number' || numberOfGuests < 1) {
        res.status(400);
        throw new Error('Number of guests must be a positive number.');
    }

    // Validate reservationTime is a valid date
    const parsedReservationTime = new Date(reservationTime);
    if (isNaN(parsedReservationTime.getTime())) {
        res.status(400);
        throw new Error('Invalid reservation time format. Please provide a valid date/time.');
    }

   
    const existingReservation = await Reservation.findOne({
        tableNumber,
        reservationTime: parsedReservationTime,
        
        status: { $in: ['pending', 'confirmed', 'seated'] } // Only check active reservations
    });

    if (existingReservation) {
        res.status(409); // Conflict
        throw new Error(`Table ${tableNumber} is already reserved at ${parsedReservationTime.toLocaleString()}.`);
    }


    const reservation = await Reservation.create({
        tableNumber,
        customerName,
        customerPhoneNumber,
        numberOfGuests,
        reservationTime: parsedReservationTime, // Use the parsed Date object
        notes,
        reservedBy: req.user._id, // The admin user making the reservation
    });

    res.status(201).json(reservation);
});

// @desc    Get all reservations (with optional filters)
// @route   GET /api/reservations
// @access  Private/Admin
const getReservations = asyncHandler(async (req, res) => {
    const { status, date, tableNumber } = req.query;
    const query = {};

    if (status) {
        query.status = status;
    }
    if (tableNumber) {
        query.tableNumber = tableNumber;
    }
    if (date) {
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0); // Start of the day in UTC
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999); // End of the day in UTC

        query.reservationTime = {
            $gte: startOfDay,
            $lte: endOfDay,
        };
    }

    const reservations = await Reservation.find(query)
        .populate('reservedBy', 'name email role') // Populate the user who made the reservation
        .sort({ reservationTime: 1 }); // Sort by time ascending

    res.json(reservations);
});

// @desc    Get a single reservation by ID
// @route   GET /api/reservations/:id
// @access  Private/Admin
const getReservationById = asyncHandler(async (req, res) => {
    const reservation = await Reservation.findById(req.params.id)
        .populate('reservedBy', 'name email role');

    if (reservation) {
        res.json(reservation);
    } else {
        res.status(404);
        throw new Error('Reservation not found');
    }
});

// @desc    Update reservation status
// @route   PUT /api/reservations/:id/status
// @access  Private/Admin
const updateReservationStatus = asyncHandler(async (req, res) => {
    const { status } = req.body; // Expected status: 'confirmed', 'seated', 'cancelled', 'completed'

    const reservation = await Reservation.findById(req.params.id);

    if (!reservation) {
        res.status(404);
        throw new Error('Reservation not found');
    }

    // Basic validation for status transition (optional, but good practice)
    const validStatuses = ['pending', 'confirmed', 'seated', 'cancelled', 'completed'];
    if (!validStatuses.includes(status)) {
        res.status(400);
        throw new Error('Invalid status provided');
    }

    // You might add more complex logic here, e.g., cannot confirm a cancelled reservation
    // if (reservation.status === 'cancelled' && status !== 'cancelled') {
    //     res.status(400);
    //     throw new Error('Cannot change status of a cancelled reservation');
    // }

    reservation.status = status;
    const updatedReservation = await reservation.save();

    res.json(updatedReservation);
});

// @desc    Delete a reservation
// @route   DELETE /api/reservations/:id
// @access  Private/Admin
const deleteReservation = asyncHandler(async (req, res) => {
    const reservation = await Reservation.findById(req.params.id);

    if (!reservation) {
        res.status(404);
        throw new Error('Reservation not found');
    }

    await reservation.deleteOne();
    res.json({ message: 'Reservation removed successfully' });
});


module.exports = {
    createReservation,
    getReservations,
    getReservationById,
    updateReservationStatus,
    deleteReservation,
};
