// models/Order.js
const mongoose = require("mongoose");
const Dish = require("./Dish"); // Import Dish model to get price for calculation

// Sub-schema for individual items within an order
const orderItemSchema = new mongoose.Schema({
  dish: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Dish",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1"],
  },
  // Status for individual item in the kitchen workflow
  status: {
    type: String,
    enum: [
      "pending",
      "accepted",
      "declined",
      "preparing",
      "ready",
      "cancelled",
      "cancellation_requested",
    ],
    default: "pending",
  },
  notes: {
    // Special requests or notes for this specific dish item
    type: String,
    trim: true,
    default: "",
  },
});

// Main Order Schema
const orderSchema = new mongoose.Schema(
  {
    tableNumber: {
      type: String,
      required: true,
      trim: true,
    },
    waiter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    items: [orderItemSchema], // Array of sub-documents
    orderStatus: {
      // Overall order status
      type: String,
      enum: ["pending", "preparing", "ready", "completed", "cancelled"],
      default: "pending",
    },
    totalAmount: {
      // Calculated based on accepted/non-cancelled items
      type: Number,
      required: true,
      default: 0,
      min: [0, "Total amount cannot be negative"],
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    customerPhoneNumber: {
      type: String,
      required: true,
      trim: true,
      match: [
        /^\+[1-9]\d{1,14}$/,
        "Please enter a valid phone number in E.164 format (e.g., +1234567890)",
      ],
    },
    isBilled: {
      // Flag to indicate if a bill has been generated for this order
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

// Pre-save hook to calculate totalAmount based on accepted and non-cancelled items
orderSchema.pre("save", async function (next) {
  let calculatedTotal = 0;
  const order = this; // 'this' refers to the current order document

  // Only calculate if items array is modified or it's a new order
  if (order.isModified("items") || order.isNew) {
    // Populate the 'dish' field within 'items' to get access to dish prices
    await order.populate("items.dish");

    for (const item of order.items) {
      // Only include items that are 'accepted' AND NOT 'cancelled' AND NOT 'cancellation_requested'
      if (
        item.status === "accepted" &&
        item.status !== "cancelled" &&
        item.status !== "cancellation_requested"
      ) {
        const dish = item.dish; // Already populated
        if (dish && typeof dish.price === "number") {
          calculatedTotal += dish.price * item.quantity;
        } else {
          console.warn(
            `Dish with ID ${
              item.dish ? item.dish._id : "N/A"
            } or its price not found for order item. Skipping calculation.`
          );
        }
      }
    }
    order.totalAmount = calculatedTotal;
    // After calculation, depopulate to prevent sending full dish objects in saved order
    order.depopulate("items.dish");
  }
  next();
});

// Add an index to the 'status' field within the 'items' array
// This creates a multi-key index, significantly speeding up queries
// that filter orders based on item statuses (e.g., for the Chef Dashboard).
orderSchema.index({ 'items.status': 1 });

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
