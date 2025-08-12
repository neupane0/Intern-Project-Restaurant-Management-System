// models/Reservation.js
const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema(
    {
        tableNumber: {
            type: String,
            required: true,
            trim: true,
            
        },
        customerName: {
            type: String,
            required: true,
            trim: true,
        },
        customerPhoneNumber: {
            type: String,
            required: true,
            trim: true,
            match: [/^\+[1-9]\d{1,14}$/, 'Please enter a valid phone number in E.164 format (e.g., +1234567890)'],
        },
        numberOfGuests: {
            type: Number,
            required: true,
            min: [1, 'Number of guests must be at least 1'],
        },
        reservationTime: { // Specific date and time for the reservation
            type: Date,
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'confirmed', 'seated', 'cancelled', 'completed'],
            default: 'pending',
        },
        isCustomerReservation: {
            type: Boolean,
            default: false,
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        approvedAt: {
            type: Date,
        },
        reservedBy: { // User (Admin) who made the reservation
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        notes: { // Any special requests or notes
            type: String,
            trim: true,
            default: '',
        },
    },
    {
        timestamps: true, // Adds createdAt and updatedAt
    }
);


reservationSchema.index({ tableNumber: 1, reservationTime: 1 });

const Reservation = mongoose.model('Reservation', reservationSchema);

module.exports = Reservation;
