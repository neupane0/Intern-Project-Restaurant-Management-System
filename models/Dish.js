// models/Dish.js
const mongoose = require('mongoose');

const dishSchema = mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
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
        },
        isAvailable: {
            type: Boolean,
            default: true,
        },
        imageUrl: {
            type: String,
            default: '',
        },
        dietaryRestrictions: {
            type: [String],
            default: [],
            enum: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'halal', 'kosher'],
        },
        
        isSpecial: {
            type: Boolean,
            default: false,
        },
        specialPrice: {
            type: Number,
            min: 0,
            required: function() { return this.isSpecial; },
        },
        
        specialStartDate: {
            type: Date,
            required: function() { return this.isSpecial; },
        },
        specialEndDate: {
            type: Date,
            required: function() { return this.isSpecial; },
        },
        
    },
    {
        timestamps: true,
    }
);

const Dish = mongoose.model('Dish', dishSchema);

module.exports = Dish;