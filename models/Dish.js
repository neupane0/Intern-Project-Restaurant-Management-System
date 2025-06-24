// models/Dish.js
const mongoose = require('mongoose');

const dishSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    price: { type: Number, required: true, min: 0 },
    category: { type: String }, // e.g., 'Appetizer', 'Main Course', 'Dessert', 'Drink'
    isAvailable: { type: Boolean, default: true },
    imageUrl: { type: String }, // Optional: for frontend
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Dish', dishSchema);