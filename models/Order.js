// models/Order.js
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    dish: { type: mongoose.Schema.Types.ObjectId, ref: 'Dish', required: true },
    quantity: { type: Number, required: true, min: 1 },
    // Status of individual dish within the order (chef can accept/decline per dish)
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' }
});

const orderSchema = new mongoose.Schema({
    tableNumber: { type: String, required: true },
    waiter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [orderItemSchema], // Array of dishes in the order
    // Overall order status
    orderStatus: {
        type: String,
        enum: ['pending', 'preparing', 'ready', 'completed', 'cancelled'],
        default: 'pending'
    },
    totalAmount: { type: Number, default: 0 }, // Calculated based on accepted dishes
    orderDate: { type: Date, default: Date.now },
    isBilled: { type: Boolean, default: false } // To track if a bill has been generated
});

module.exports = mongoose.model('Order', orderSchema);