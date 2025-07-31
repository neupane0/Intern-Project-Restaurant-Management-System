// models/Dish.js
const mongoose = require('mongoose');

const dishSchema = mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            unique: true, 
        },
        description: {
            type: String,
            trim: true,
            default: ''
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        category: {
            type: String,
            required: true,
            trim: true,
        },
        isAvailable: {
            type: Boolean,
            default: true,
        },
        //  Dietary Restrictions 
        dietaryRestrictions: {
            type: [String], 
            default: [],    
            enum: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'halal', 'kosher'], 
        },
    },
    {
        timestamps: true,
    }
);

const Dish = mongoose.model('Dish', dishSchema);

module.exports = Dish;