// models/Order.js
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    dish: { type: mongoose.Schema.Types.ObjectId, ref: 'Dish', required: true },
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

// --- CRITICAL UPDATE: pre('save') hook for totalAmount calculation ---
// This hook will run before an order is saved to the database.
orderSchema.pre('save', async function (next) {
    // Only recalculate totalAmount if the 'items' array has been modified or it's a brand new order.
    // This prevents unnecessary calculations on subsequent saves if only other fields change.
    if (this.isModified('items') || this.isNew || this.isModified('orderStatus')) {
        // We need to 'populate' the 'dish' field within each order item to access the dish's price.
        await this.populate('items.dish'); // Populates the 'dish' field with actual Dish documents

        this.totalAmount = this.items.reduce((acc, orderItem) => {
            // Check if the dish was successfully populated and has a price.
            if (orderItem.dish && typeof orderItem.dish.price === 'number' && orderItem.status === 'accepted') {
                return acc + (orderItem.quantity * orderItem.dish.price);
            }
            // If a dish is not found or has no price, we might want to log a warning
            // or handle it differently based on business logic. For now, it won't add to total.
            console.warn(`Warning: Dish with ID ${orderItem.dish ? orderItem.dish._id : 'N/A'} or its price not found/accepted for order item.`);
            return acc;
        }, 0);

        // Removed: this.depopulate('items.dish'); <-- This line was causing the issue.
    }
    next(); // Proceed with the save operation
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
