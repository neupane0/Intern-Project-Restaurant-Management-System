// models/Order.js
const mongoose = require('mongoose');

// The orderItemSchema now stores a full "snapshot" of the dish's details
// at the time of the order, including the price used for the total.
const orderItemSchema = new mongoose.Schema({
    // We still link to the original dish for reference, but don't populate it
    dish: { type: mongoose.Schema.Types.ObjectId, ref: 'Dish', required: true },
    name: { type: String, required: true },
    description: { type: String, required: false },
    category: { type: String, required: true },
    price: { type: Number, required: true }, // This is the crucial field that holds the final price
    quantity: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' }
});

const orderSchema = new mongoose.Schema({
    tableNumber: { type: String, required: true },
    waiter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [orderItemSchema], // Array of dishes in the order
    orderStatus: {
        type: String,
        enum: ['pending', 'preparing', 'ready', 'completed', 'cancelled'],
        default: 'pending'
    },
    totalAmount: { type: Number, default: 0 },
    orderDate: { type: Date, default: Date.now },
    isBilled: { type: Boolean, default: false },
    customerPhoneNumber: {
        type: String,
        required: true,
        match: [/^\+[1-9]\d{1,14}$/, 'Please enter a valid phone number in E.164 format (e.g., +1234567890)']
    }
});



const Order = mongoose.model('Order', orderSchema);

module.exports = Order;