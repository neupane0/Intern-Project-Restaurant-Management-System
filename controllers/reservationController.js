// controllers/reservationController.js
const asyncHandler = require('express-async-handler');
const Reservation = require('../models/Reservation');
const { sendWhatsAppMessage } = require('../utils/whatsappService'); // NEW: Import WhatsApp service
const User = require('../models/User'); // NEW: Import User model to get admin/user name for message

// --- Hardcoded list of all tables in the restaurant ---
// In a more complex system, you would have a 'Table' model in the database.
const ALL_TABLE_NUMBERS = ['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6', 'T-7', 'T-8', 'T-9', 'T-10'];
// You could also add capacities here: e.g., { number: 'T-1', capacity: 4 }


// @desc    Create a new table reservation
// @route   POST /api/reservations
// @access  Private/Admin, Waiter
const createReservation = asyncHandler(async (req, res) => {
    const { tableNumber, customerName, customerPhoneNumber, numberOfGuests, reservationTime, notes } = req.body;

    // Basic input validation
    if (!tableNumber || !customerName || !customerPhoneNumber || !numberOfGuests || !reservationTime) {
        res.status(400);
        throw new Error('Please fill all required reservation fields: table number, customer name, phone number, number of guests, and reservation time.');
    }

    // Validate tableNumber against our known list (optional, but good for consistency)
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

    // Define a time window for conflict checking (e.g., 2 hours before and 2 hours after the requested time)
    // This prevents booking the same table for overlapping reservations.
    const conflictWindowStart = new Date(parsedReservationTime.getTime() - (2 * 60 * 60 * 1000)); // 2 hours before
    const conflictWindowEnd = new Date(parsedReservationTime.getTime() + (2 * 60 * 60 * 1000));   // 2 hours after

    // Check for existing reservations for this table within the time window
    const existingReservation = await Reservation.findOne({
        tableNumber,
        reservationTime: {
            $gte: conflictWindowStart,
            $lte: conflictWindowEnd
        },
        status: { $in: ['pending', 'confirmed', 'seated'] } // Only check active reservations
    });

    if (existingReservation) {
        res.status(409); // Conflict
        throw new Error(`Table ${tableNumber} is already reserved or unavailable around ${parsedReservationTime.toLocaleTimeString()} on ${parsedReservationTime.toLocaleDateString()}.`);
    }

    const reservation = await Reservation.create({
        tableNumber,
        customerName,
        customerPhoneNumber,
        numberOfGuests,
        reservationTime: parsedReservationTime, // Use the parsed Date object
        notes,
        reservedBy: req.user._id, // The authenticated user (admin or waiter) making the reservation
        isCustomerReservation: false, // Admin/waiter reservations are not customer reservations
        status: 'confirmed', // Admin/waiter reservations are automatically confirmed
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

    const oldStatus = reservation.status; // Store old status for comparison
    reservation.status = status;
    
    // If confirming a customer reservation, set approval details
    if (status === 'confirmed' && reservation.isCustomerReservation && oldStatus === 'pending') {
        reservation.approvedBy = req.user._id;
        reservation.approvedAt = new Date();
    }
    
    const updatedReservation = await reservation.save();

    // NEW: Send WhatsApp notification if status changes to 'confirmed'
    if (updatedReservation.status === 'confirmed' && oldStatus !== 'confirmed') {
        const adminUser = await User.findById(req.user._id).select('name'); // Get admin's name
        const adminName = adminUser ? adminUser.name : 'Admin';

        const messageBody = `Hello ${updatedReservation.customerName}!\n\n` +
                            `Your reservation for Table ${updatedReservation.tableNumber} ` +
                            `at ${updatedReservation.reservationTime.toLocaleString()} for ${updatedReservation.numberOfGuests} guests ` +
                            `has been *CONFIRMED* by ${adminName}.\n\n` +
                            `We look forward to seeing you!\n` +
                            `Restaurant Name`; // Replace with your restaurant name

        await sendWhatsAppMessage(updatedReservation.customerPhoneNumber, messageBody);
    }

    res.json(updatedReservation);
});

// @desc    Get pending customer reservations for admin approval
// @route   GET /api/reservations/pending-customer
// @access  Private/Admin
const getPendingCustomerReservations = asyncHandler(async (req, res) => {
    const reservations = await Reservation.find({
        isCustomerReservation: true,
        status: 'pending'
    })
    .populate('reservedBy', 'name email')
    .sort({ createdAt: 1 });

    res.json(reservations);
});

// @desc    Approve or reject customer reservation
// @route   PUT /api/reservations/:id/approve
// @access  Private/Admin
const approveCustomerReservation = asyncHandler(async (req, res) => {
    const { action } = req.body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
        res.status(400);
        throw new Error('Action must be either "approve" or "reject"');
    }

    const reservation = await Reservation.findById(req.params.id);

    if (!reservation) {
        res.status(404);
        throw new Error('Reservation not found');
    }

    if (!reservation.isCustomerReservation) {
        res.status(400);
        throw new Error('This is not a customer reservation');
    }

    if (reservation.status !== 'pending') {
        res.status(400);
        throw new Error('Reservation is not in pending status');
    }

    const oldStatus = reservation.status;
    
    if (action === 'approve') {
        reservation.status = 'confirmed';
        reservation.approvedBy = req.user._id;
        reservation.approvedAt = new Date();
    } else {
        reservation.status = 'cancelled';
    }

    const updatedReservation = await reservation.save();

    // Send WhatsApp notification if approved
    if (action === 'approve') {
        const adminUser = await User.findById(req.user._id).select('name');
        const adminName = adminUser ? adminUser.name : 'Admin';

        const messageBody = `Hello ${updatedReservation.customerName}!\n\n` +
                            `Your reservation for Table ${updatedReservation.tableNumber} ` +
                            `at ${updatedReservation.reservationTime.toLocaleString()} for ${updatedReservation.numberOfGuests} guests ` +
                            `has been *APPROVED* by ${adminName}.\n\n` +
                            `We look forward to seeing you!\n` +
                            `Restaurant Name`;

        await sendWhatsAppMessage(updatedReservation.customerPhoneNumber, messageBody);
    }

    res.json({
        message: `Reservation ${action}d successfully`,
        reservation: updatedReservation
    });
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


// @desc    Get list of available tables for a given time
// @route   GET /api/reservations/available?reservationTime=YYYY-MM-DDTHH:MM:SSZ&numberOfGuests=N
// @access  Public (no login required)
const getAvailableTables = asyncHandler(async (req, res) => {
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

    // Define the time window for checking conflicts (e.g., 2 hours before and 2 hours after)
    const conflictWindowStart = new Date(parsedReservationTime.getTime() - (2 * 60 * 60 * 1000)); // 2 hours before
    const conflictWindowEnd = new Date(parsedReservationTime.getTime() + (2 * 60 * 60 * 1000));   // 2 hours after

    // Find all active reservations within the conflict window
    const conflictingReservations = await Reservation.find({
        reservationTime: {
            $gte: conflictWindowStart,
            $lte: conflictWindowEnd
        },
        status: { $in: ['pending', 'confirmed', 'seated'] }
    });

    // Get table numbers that are already reserved
    const reservedTableNumbers = conflictingReservations.map(res => res.tableNumber);

    // Filter out reserved tables from the list of all tables
    const availableTableNumbers = ALL_TABLE_NUMBERS.filter(tableNum =>
        !reservedTableNumbers.includes(tableNum)
    );

    // Optional: Filter by numberOfGuests if you had table capacities defined
    // For now, we return all available tables regardless of guest count.
    // If ALL_TABLE_NUMBERS was an array of objects with capacities:
    // const availableTablesWithCapacity = ALL_TABLE_NUMBERS.filter(table =>
    //     !reservedTableNumbers.includes(table.number) && table.capacity >= numberOfGuests
    // );


    res.json({
        requestedTime: parsedReservationTime,
        availableTables: availableTableNumbers,
        // You can also return the reserved tables for debugging/info
        // reservedTables: reservedTableNumbers
    });
});


module.exports = {
    createReservation,
    getReservations,
    getReservationById,
    updateReservationStatus,
    deleteReservation,
    getAvailableTables,
    getPendingCustomerReservations,
    approveCustomerReservation,
};
