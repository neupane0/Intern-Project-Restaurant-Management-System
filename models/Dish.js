// models/Dish.js
const mongoose = require("mongoose");

const dishSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true, // Assuming dish names should be unique
    },
    description: {
      type: String,
      trim: true,
      default: "",
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
    // --- NEW FIELD: Dietary Restrictions ---
    dietaryRestrictions: {
      type: [String], // Array of strings (e.g., ['vegetarian', 'gluten-free'])
      default: [], // Default to an empty array
      enum: [
        "vegetarian",
        "vegan",
        "gluten-free",
        "dairy-free",
        "nut-free",
        "halal",
        "kosher",
      ], // Example enums
    },
  },
  {
    timestamps: true,
  }
);

const Dish = mongoose.model("Dish", dishSchema);

module.exports = Dish;
