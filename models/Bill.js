// models/Bill.js
const mongoose = require("mongoose");

// Sub-schema for items included in the bill
const billItemSchema = mongoose.Schema({
  dish: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dish",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  price: {
    // Price at the time of billing (important if dish prices change later)
    type: Number,
    required: true,
  },
});

// Main Bill Schema
const billSchema = mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    billedBy: {
      // User who generated the bill (e.g., Admin)
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [billItemSchema], // Array of billed items for this specific bill portion
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
      enum: ["pending", "paid", "refunded"], // Payment statuses
      default: "pending",
    },
    // --- NEW FIELDS FOR SPLIT BILLING ---
    isSplitBill: {
      // Flag to indicate if this bill is part of a split operation
      type: Boolean,
      default: false,
    },
    splitGroupIdentifier: {
      // A unique ID to link all bills that are part of the same split operation
      type: String,
      default: null, // Will be set when a bill is split
    },
    originalOrderTotal: {
      // Store the total of the original order for reference in split bills
      type: Number,
      default: 0,
    },
    customerName: {
      // Optional: Name of the customer responsible for this specific split bill
      type: String,
      required: false,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);

const Bill = mongoose.model("Bill", billSchema);

module.exports = Bill;
