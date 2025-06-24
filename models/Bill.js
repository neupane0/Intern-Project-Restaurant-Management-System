// models/Bill.js
const mongoose = require('mongoose');

const billItemSchema = new mongoose.Schema({
    dish: { type: mongoose.Schema.Types.ObjectId, ref: 'Dish', required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true } // Price at the time of billing
});

const billSchema = new mongoose.Schema({
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    billedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Admin who generated the bill
    items: [billItemSchema], // Items that were accepted and billed
    totalAmount: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
    billDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Bill', billSchema);