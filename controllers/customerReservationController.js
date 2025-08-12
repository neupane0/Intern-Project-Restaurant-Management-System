// controllers/customerReservationController.js
const asyncHandler = require('express-async-handler');
const Reservation = require('../models/Reservation');
const User = require('../models/User');

// @desc    Create a new reservation as a customer
// @route   POST /api/customer/reservations
// @access  Private/Customer
const createCustomerReservation = asyncHandler(async (req, res) => {
    const { tableNumber, customerName, customerPhoneNumber, numberOfGuests, reservationTime, notes } = req.body;

    // Basic input validation
    if (!tableNumber || !customerName || !customerPhoneNumber || !numberOfGuests || !reservationTime) {
        res.status(400);
        throw new Error('Please fill all required reservation fields: table number, customer name, phone number, number of guests, and reservation time.');
    }

    // Validate tableNumber against our known list
    const ALL_TABLE_NUMBERS = ['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-7', 'T-8', 'T-9', 'T-10'];
    if (!ALL_TABLE_NUMBERS.includes(tableNumber)) {
        res.status(400);
        throw new Error(`Invalid table number: ${tableNumber}. Please choose from ${ALL_TABLE_NUMBERS.join(', ')}.`);
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
        throw new Error('Invalid reservation time format. Please provide a valid date/time (e.g., ISO 8601).');
    }

    // Check for existing reservations for this table within the time window
    const conflictWindowStart = new Date(parsedReservationTime.getTime() - (2 * 60 * 60 * 1000));
    const conflictWindowEnd = new Date(parsedReservationTime.getTime() + (2 * 60 * 60 * 1000));

    const existingReservation = await Reservation.findOne({
        tableNumber,
        reservationTime: {
            $gte: conflictWindowStart,
            $lte: conflictWindowEnd
        },
        status: { $in: ['pending', 'confirmed', 'seated'] }
    });

    if (existingReservation) {
        res.status(409);
        throw new Error(`Table ${tableNumber} is already reserved or unavailable around ${parsedReservationTime.toLocaleTimeString()} on ${parsedReservationTime.toLocaleDateString()}.`);
    }

    const reservation = await Reservation.create({
        tableNumber,
        customerName,
        customerPhoneNumber,
        numberOfGuests,
        reservationTime: parsedReservationTime,
        notes,
        reservedBy: req.user._id,
        isCustomerReservation: true, // Mark as customer reservation
        status: 'pending', // Customer reservations start as pending
    });

    res.status(201).json({
        ...reservation.toObject(),
        message: 'Reservation created successfully. It will be reviewed by admin and you will be notified once approved.'
    });
});

// @desc    Get customer's own reservations
// @route   GET /api/customer/reservations
// @access  Private/Customer
const getCustomerReservations = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const query = { reservedBy: req.user._id };

    if (status) {
        query.status = status;
    }

    const reservations = await Reservation.find(query)
        .sort({ reservationTime: 1 });

    res.json(reservations);
});

// @desc    Get a single customer reservation by ID
// @route   GET /api/customer/reservations/:id
// @access  Private/Customer
const getCustomerReservationById = asyncHandler(async (req, res) => {
    const reservation = await Reservation.findOne({
        _id: req.params.id,
        reservedBy: req.user._id
    });

    if (reservation) {
        res.json(reservation);
    } else {
        res.status(404);
        throw new Error('Reservation not found or you do not have permission to view it');
    }
});

// @desc    Update customer's own reservation
// @route   PUT /api/customer/reservations/:id
// @access  Private/Customer
const updateCustomerReservation = asyncHandler(async (req, res) => {
    const { tableNumber, customerName, customerPhoneNumber, numberOfGuests, reservationTime, notes } = req.body;

    const reservation = await Reservation.findOne({
        _id: req.params.id,
        reservedBy: req.user._id
    });

    if (!reservation) {
        res.status(404);
        throw new Error('Reservation not found or you do not have permission to update it');
    }

    // Only allow updates if reservation is still pending
    if (reservation.status !== 'pending') {
        res.status(400);
        throw new Error('Cannot update reservation that is not in pending status');
    }

    // Validate tableNumber if provided
    if (tableNumber) {
        const ALL_TABLE_NUMBERS = ['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-7', 'T-8', 'T-9', 'T-10'];
        if (!ALL_TABLE_NUMBERS.includes(tableNumber)) {
            res.status(400);
            throw new Error(`Invalid table number: ${tableNumber}. Please choose from ${ALL_TABLE_NUMBERS.join(', ')}.`);
        }

        // Check for conflicts if table number is being changed
        if (tableNumber !== reservation.tableNumber) {
            const parsedReservationTime = reservationTime ? new Date(reservationTime) : reservation.reservationTime;
            const conflictWindowStart = new Date(parsedReservationTime.getTime() - (2 * 60 * 60 * 1000));
            const conflictWindowEnd = new Date(parsedReservationTime.getTime() + (2 * 60 * 60 * 1000));

            const existingReservation = await Reservation.findOne({
                _id: { $ne: req.params.id },
                tableNumber,
                reservationTime: {
                    $gte: conflictWindowStart,
                    $lte: conflictWindowEnd
                },
                status: { $in: ['pending', 'confirmed', 'seated'] }
            });

            if (existingReservation) {
                res.status(409);
                throw new Error(`Table ${tableNumber} is already reserved or unavailable around ${parsedReservationTime.toLocaleTimeString()} on ${parsedReservationTime.toLocaleDateString()}.`);
            }
        }
    }

    // Update fields
    if (tableNumber) reservation.tableNumber = tableNumber;
    if (customerName) reservation.customerName = customerName;
    if (customerPhoneNumber) reservation.customerPhoneNumber = customerPhoneNumber;
    if (numberOfGuests) reservation.numberOfGuests = numberOfGuests;
    if (reservationTime) reservation.reservationTime = new Date(reservationTime);
    if (notes !== undefined) reservation.notes = notes;

    const updatedReservation = await reservation.save();

    res.json({
        ...updatedReservation.toObject(),
        message: 'Reservation updated successfully. It will be reviewed by admin again.'
    });
});

// @desc    Cancel customer's own reservation
// @route   DELETE /api/customer/reservations/:id
// @access  Private/Customer
const cancelCustomerReservation = asyncHandler(async (req, res) => {
    const reservation = await Reservation.findOne({
        _id: req.params.id,
        reservedBy: req.user._id
    });

    if (!reservation) {
        res.status(404);
        throw new Error('Reservation not found or you do not have permission to cancel it');
    }

    // Only allow cancellation if reservation is pending or confirmed
    if (!['pending', 'confirmed'].includes(reservation.status)) {
        res.status(400);
        throw new Error('Cannot cancel reservation that is already seated, completed, or cancelled');
    }

    reservation.status = 'cancelled';
    await reservation.save();

    res.json({
        message: 'Reservation cancelled successfully',
        reservation
    });
});

// @desc    Get available tables for customer
// @route   GET /api/customer/reservations/available
// @access  Private/Customer
const getCustomerAvailableTables = asyncHandler(async (req, res) => {
    const { reservationTime, numberOfGuests } = req.query;

    if (!reservationTime) {
        res.status(400);
        throw new Error('Reservation time is required to check availability.');
    }

    const parsedReservationTime = new Date(reservationTime);
    if (isNaN(parsedReservationTime.getTime())) {
        res.status(400);
        throw new Error('Invalid reservation time format. Please provide a valid date/time (e.g., ISO 8601).');
    }

    const ALL_TABLE_NUMBERS = ['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-7', 'T-8', 'T-9', 'T-10'];
    const conflictWindowStart = new Date(parsedReservationTime.getTime() - (2 * 60 * 60 * 1000));
    const conflictWindowEnd = new Date(parsedReservationTime.getTime() + (2 * 60 * 60 * 1000));

    const conflictingReservations = await Reservation.find({
        reservationTime: {
            $gte: conflictWindowStart,
            $lte: conflictWindowEnd
        },
        status: { $in: ['pending', 'confirmed', 'seated'] }
    });

    const reservedTableNumbers = conflictingReservations.map(res => res.tableNumber);
    const availableTableNumbers = ALL_TABLE_NUMBERS.filter(tableNum =>
        !reservedTableNumbers.includes(tableNum)
    );

    res.json({
        requestedTime: parsedReservationTime,
        availableTables: availableTableNumbers,
    });
});

module.exports = {
    createCustomerReservation,
    getCustomerReservations,
    getCustomerReservationById,
    updateCustomerReservation,
    cancelCustomerReservation,
    getCustomerAvailableTables,
}; 