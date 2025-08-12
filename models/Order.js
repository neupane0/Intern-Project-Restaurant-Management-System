// models/Order.js
const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
  dish: { type: mongoose.Schema.Types.ObjectId, ref: "Dish", required: true },
  quantity: { type: Number, required: true, min: 1 },
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
  notes: { type: String, default: "" },
});

const orderSchema = new mongoose.Schema({
  tableNumber: { type: String, required: true },
  customerName: { type: String, required: true },
  waiter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [orderItemSchema], // Array of dishes in the order
  orderStatus: {
    type: String,
    enum: ["pending", "preparing", "ready", "completed", "cancelled"],
    default: "pending",
  },
  totalAmount: { type: Number, default: 0 },
  orderDate: { type: Date, default: Date.now },
  isBilled: { type: Boolean, default: false },
  customerPhoneNumber: {
    type: String,
    required: true,
    match: [
      /^\+[1-9]\d{1,14}$/,
      "Please enter a valid phone number in E.164 format (e.g., +1234567890)",
    ],
  },
  // --- NEW: Timestamps for status tracking ---
  timestamps: {
    pending: { type: Date, default: Date.now },
    preparing: { type: Date },
    ready: { type: Date },
    completed: { type: Date },
  },
});

// --- CRITICAL UPDATE: pre('save') hook for totalAmount and NEW: Timestamps ---
orderSchema.pre("save", async function (next) {
  if (
    this.isModified("items") ||
    this.isNew ||
    this.isModified("orderStatus")
  ) {
    await this.populate("items.dish");

    // Recalculate totalAmount based on 'accepted' items
    this.totalAmount = this.items.reduce((acc, orderItem) => {
      if (
        orderItem.dish &&
        typeof orderItem.dish.price === "number" &&
        orderItem.status === "accepted"
      ) {
        return acc + orderItem.quantity * orderItem.dish.price;
      }
      console.warn(
        `Warning: Dish with ID ${
          orderItem.dish ? orderItem.dish._id : "N/A"
        } or its price not found/accepted for order item.`
      );
      return acc;
    }, 0);

    // --- NEW LOGIC: Update timestamps based on orderStatus changes ---
    const now = new Date();
    if (this.isModified("orderStatus")) {
      if (this.orderStatus === "preparing" && !this.timestamps.preparing) {
        this.timestamps.preparing = now;
      } else if (this.orderStatus === "ready" && !this.timestamps.ready) {
        this.timestamps.ready = now;
      } else if (
        this.orderStatus === "completed" &&
        !this.timestamps.completed
      ) {
        this.timestamps.completed = now;
      }
    }
  }
  next();
});

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
