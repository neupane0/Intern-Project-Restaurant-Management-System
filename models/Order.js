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
    // --- NEW FIELD: Customer Phone Number ---
    customerPhoneNumber: {
        type: String,
        required: true, // Making it required for WhatsApp feature
        // Basic regex for phone numbers (adjust as per country codes/format needed)
        match: [/^\+[1-9]\d{1,14}$/, 'Please enter a valid phone number in E.164 format (e.g., +1234567890)']
    }
});

// Pre-save hook to calculate totalAmount before saving the order
orderSchema.pre('save', async function (next) {
    if (this.isModified('items') || this.isNew || this.isModified('orderStatus')) {
        await this.populate('items.dish');
        this.totalAmount = this.items.reduce((acc, orderItem) => {
            if (orderItem.dish && typeof orderItem.dish.price === 'number' && orderItem.status === 'accepted') {
                return acc + (orderItem.quantity * orderItem.dish.price);
            }
            console.warn(`Warning: Dish with ID ${orderItem.dish ? orderItem.dish._id : 'N/A'} or its price not found/accepted for order item.`);
            return acc;
        }, 0);
        this.depopulate('items.dish');
    }
    next();
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;