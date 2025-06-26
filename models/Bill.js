// models/Bill.js
const mongoose = require('mongoose');

const billItemSchema = mongoose.Schema({
    dish: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Dish',
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
    },
    price: { // Price at the time of billing (important if dish prices change later)
        type: Number,
        required: true,
    },
});

const billSchema = mongoose.Schema(
    {
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
            unique: true, // An order should only be billed once
        },
        billedBy: { // User who generated the bill (Admin)
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        items: [billItemSchema], // Array of billed items
        totalAmount: {
            type: Number,
            required: true,
            default: 0,
        },
        billDate: {
            type: Date,
            default: Date.now,
        },
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'refunded'], // Payment statuses
            default: 'pending',
        },
        customerPhoneNumber: {
            type: String,
            required: true, // Ensure the bill has the customer's phone number
        }
    },
    {
        timestamps: true,
    }
);

const Bill = mongoose.model('Bill', billSchema);

module.exports = Bill;
