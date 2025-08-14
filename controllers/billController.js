// controllers/billController.js
const asyncHandler = require("express-async-handler");
const Bill = require("../models/Bill");
const Order = require("../models/Order");
const Dish = require("../models/Dish");
const { sendWhatsAppMessage } = require("../utils/whatsappService");
const User = require("../models/User");
const { v4: uuidv4 } = require("uuid");

// @desc    Generate a bill for a completed order
// @route   POST /api/bills/:orderId
// @access  Private/Admin
const generateBill = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId)
    .populate("items.dish")
    .populate("waiter", "name");

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  if (order.isBilled) {
    res.status(400);
    throw new Error("This order has already been billed");
  }

  const billedItems = [];
  let totalAmount = 0;
  const today = new Date();

  for (const item of order.items) {
    if (!item.dish) {
      res.status(500);
      throw new Error(
        `Dish not populated for item ${item._id} in order ${order._id}.`
      );
    }

    if (item.status === "accepted") {
      let priceToUse = item.dish.price;

      //  logic to check top-level special offer dates 
      if (
        item.dish.isSpecial &&
        item.dish.specialPrice &&
        item.dish.specialStartDate &&
        item.dish.specialEndDate
      ) {
        const specialStart = new Date(item.dish.specialStartDate);
        const specialEnd = new Date(item.dish.specialEndDate);

        // Check if the current date is within the offer's date range
        if (today >= specialStart && today <= specialEnd) {
          priceToUse = item.dish.specialPrice;
        }
      }

      billedItems.push({
        dish: item.dish._id,
        quantity: item.quantity,
        price: priceToUse,
      });
      totalAmount += item.quantity * priceToUse;
    }
  }

  if (billedItems.length === 0) {
    res.status(400);
    throw new Error(
      "No accepted dishes in this order to bill. Please accept items first."
    );
  }

  const bill = new Bill({
    order: order._id,
    billedBy: req.user._id,
    items: billedItems,
    totalAmount: totalAmount,
    paymentStatus: "pending",
    customerPhoneNumber: order.customerPhoneNumber,
    originalOrderTotal: order.totalAmount,
    customerName: order.customerName,
  });

  const createdBill = await bill.save();

  order.isBilled = true;
  if (order.orderStatus !== "completed") {
    order.orderStatus = "completed";
  }
  await order.save();

  res.status(201).json(createdBill);
});

// @desc    Get all bills (Admin)
// @route   GET /api/bills
// @access  Private/Admin
const getBills = asyncHandler(async (req, res) => {
  const bills = await Bill.find({})
    .populate(
      "order",
      "tableNumber orderStatus customerName customerPhoneNumber"
    )
    .populate("billedBy", "name");
  res.json(bills);
});

// @desc    Get single bill by ID
// @route   GET /api/bills/:id
// @access  Private/Admin
const getBillById = asyncHandler(async (req, res) => {
  const bill = await Bill.findById(req.params.id)
    .populate(
      "order",
      "tableNumber orderStatus customerName customerPhoneNumber"
    )
    .populate("billedBy", "name");
  if (bill) {
    res.json(bill);
  } else {
    res.status(404);
    throw new Error("Bill not found");
  }
});

// @desc    Update payment status of a bill and send WhatsApp notification
// @route   PUT /api/bills/:id/pay
// @access  Private/Admin
const updateBillPaymentStatus = asyncHandler(async (req, res) => {
  const { paymentStatus } = req.body;
  const bill = await Bill.findById(req.params.id).populate(
    "order",
    "tableNumber customerName"
  );
  if (bill) {
    if (!["paid", "refunded"].includes(paymentStatus)) {
      res.status(400);
      throw new Error('Invalid payment status. Must be "paid" or "refunded".');
    }

    const oldPaymentStatus = bill.paymentStatus;
    bill.paymentStatus = paymentStatus;
    await bill.populate("items.dish");
    const updatedBill = await bill.save();

    if (paymentStatus === "paid" && oldPaymentStatus !== "paid") {
      const adminUser = await User.findById(updatedBill.billedBy).select(
        "name"
      );
      const billedByName = adminUser ? adminUser.name : "Admin";

      let messageBody = `Hello ${bill.order.customerName || "customer"}!\n`;
      messageBody += `Your bill for Table ${bill.order.tableNumber} (Order ID: ${bill.order._id}) has been PAID.\n\n`;
      messageBody += `--- Your Bill Summary ---\n`;
      updatedBill.items.forEach((item) => {
        const dishName =
          item.dish && item.dish.name ? item.dish.name : "Unknown Dish";
        messageBody += `${item.quantity}x ${dishName} @ Rs.${item.price.toFixed(
          2
        )}\n`;
      });
      messageBody += `------------------------\n`;
      messageBody += `Total Amount: Rs. ${updatedBill.totalAmount.toFixed(
        2
      )}\n`;
      messageBody += `Payment Status: PAID\n`;
      messageBody += `Billed by: ${billedByName}\n`;
      messageBody += `Thank you for your business!`;

      await sendWhatsAppMessage(updatedBill.customerPhoneNumber, messageBody);
    }

    res.json(updatedBill);
  } else {
    res.status(404);
    throw new Error("Bill not found");
  }
});

// @desc    Split a bill for an order into multiple sub-bills
// @route   POST /api/bills/:orderId/split
// @access  Private/Admin
const splitBill = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { splits } = req.body;

  if (!splits || !Array.isArray(splits) || splits.length < 2) {
    res.status(400);
    throw new Error(
      "Splits array is required and must contain at least 2 split portions."
    );
  }

  const originalOrder = await Order.findById(orderId).populate("items.dish");

  if (!originalOrder) {
    res.status(404);
    throw new Error("Original order not found.");
  }

  if (originalOrder.isBilled) {
    res.status(400);
    throw new Error("This order has already been billed and cannot be split.");
  }

  const acceptedOrderItemsMap = new Map();
  originalOrder.items.forEach((item) => {
    if (item.status === "accepted" && item.dish) {
      const dishIdStr = item.dish._id.toString();
      acceptedOrderItemsMap.set(dishIdStr, {
        dish: item.dish,
        quantity:
          (acceptedOrderItemsMap.get(dishIdStr)?.quantity || 0) + item.quantity,
      });
    }
  });

  if (acceptedOrderItemsMap.size === 0) {
    res.status(400);
    throw new Error("No accepted items in the original order to split.");
  }

  const createdBills = [];
  const splitGroupIdentifier = uuidv4();

  for (const [index, split] of splits.entries()) {
    if (
      !split.items ||
      !Array.isArray(split.items) ||
      split.items.length === 0
    ) {
      res.status(400);
      throw new Error(
        `Split portion ${index + 1} must contain at least one item.`
      );
    }

    const splitBillItems = [];
    let currentSplitAmount = 0;
    const currentSplitItemsTracker = new Map();

    for (const splitItem of split.items) {
      if (
        !splitItem.dish ||
        !splitItem.quantity ||
        typeof splitItem.quantity !== "number" ||
        splitItem.quantity <= 0
      ) {
        res.status(400);
        throw new Error(
          `Invalid item details in split portion ${
            index + 1
          }. Each item must have a valid dish ID and positive quantity.`
        );
      }

      const dishIdStr = splitItem.dish.toString();

      if (currentSplitItemsTracker.has(dishIdStr)) {
        res.status(400);
        throw new Error(
          `Duplicate dish ${dishIdStr} found within split portion ${
            index + 1
          }. Each item should appear once per split.`
        );
      }
      currentSplitItemsTracker.set(dishIdStr, splitItem.quantity);

      if (!acceptedOrderItemsMap.has(dishIdStr)) {
        res.status(400);
        throw new Error(
          `Dish ID ${dishIdStr} in split portion ${
            index + 1
          } is not part of the original accepted order items.`
        );
      }

      const originalDishInfo = acceptedOrderItemsMap.get(dishIdStr);
      if (splitItem.quantity > originalDishInfo.quantity) {
        res.status(400);
        throw new Error(
          `Quantity ${splitItem.quantity} for dish "${
            originalDishInfo.dish.name
          }" in split portion ${
            index + 1
          } exceeds available quantity in original order (${
            originalDishInfo.quantity
          }).`
        );
      }

      // logic for special price during bill split 
      const today = new Date();
      let priceToUse = originalDishInfo.dish.price;
      if (
        originalDishInfo.dish.isSpecial &&
        originalDishInfo.dish.specialPrice &&
        originalDishInfo.dish.specialStartDate &&
        originalDishInfo.dish.specialEndDate
      ) {
        const specialStart = new Date(originalDishInfo.dish.specialStartDate);
        const specialEnd = new Date(originalDishInfo.dish.specialEndDate);
        if (today >= specialStart && today <= specialEnd) {
          priceToUse = originalDishInfo.dish.specialPrice;
        }
      }

      splitBillItems.push({
        dish: originalDishInfo.dish._id,
        quantity: splitItem.quantity,
        price: priceToUse,
      });
      currentSplitAmount += splitItem.quantity * priceToUse;

      originalDishInfo.quantity -= splitItem.quantity;
      if (originalDishInfo.quantity === 0) {
        acceptedOrderItemsMap.delete(dishIdStr);
      } else {
        acceptedOrderItemsMap.set(dishIdStr, originalDishInfo);
      }
    }

    const newBill = new Bill({
      order: originalOrder._id,
      billedBy: req.user._id,
      items: splitBillItems,
      totalAmount: currentSplitAmount,
      paymentStatus: "pending",
      customerPhoneNumber: originalOrder.customerPhoneNumber,
      isSplitBill: true,
      splitGroupIdentifier: splitGroupIdentifier,
      originalOrderTotal: originalOrder.totalAmount,
      customerName: split.customerName || `Split Customer ${index + 1}`,
    });
    const createdBill = await newBill.save();
    createdBills.push(createdBill);
  }

  if (acceptedOrderItemsMap.size > 0) {
    const unallocatedDishes = Array.from(acceptedOrderItemsMap.values())
      .map((item) => `${item.dish.name} (Qty: ${item.quantity})`)
      .join(", ");
    res.status(400);
    throw new Error(
      `Not all original accepted order items were allocated in the splits. Unallocated: ${unallocatedDishes}`
    );
  }

  originalOrder.isBilled = true;
  originalOrder.orderStatus = "completed";
  await originalOrder.save();

  res.status(201).json({
    message: "Bill successfully split into multiple portions.",
    splitBills: createdBills.map((bill) => ({
      _id: bill._id,
      totalAmount: bill.totalAmount,
      customerName: bill.customerName,
      paymentStatus: bill.paymentStatus,
      splitGroupIdentifier: bill.splitGroupIdentifier,
      orderId: bill.order,
    })),
  });
});

// @desc    Get Daily Sales Report for a specific day or current day
// @route   GET /api/reports/sales/daily?date=YYYY-MM-DD
// @access  Private/Admin
const getDailySalesReport = asyncHandler(async (req, res) => {
  let targetDate;
  if (req.query.date) {
    targetDate = new Date(req.query.date);
    if (isNaN(targetDate.getTime())) {
      res.status(400);
      throw new Error("Invalid date format. Please use ISO 8601 YYYY-MM-DD.");
    }
  } else {
    targetDate = new Date();
  }

  targetDate.setHours(0, 0, 0, 0);
  const nextDay = new Date(targetDate);
  nextDay.setDate(targetDate.getDate() + 1);

  const existingReport = await Report.findOne({
    reportType: "daily_sales",
    reportDate: targetDate,
  });

  if (existingReport && req.query.generate !== "true") {
    return res.json(existingReport.data);
  }

  const dailySales = await Bill.aggregate([
    {
      $match: {
        billDate: { $gte: targetDate, $lt: nextDay },
        paymentStatus: "paid",
      },
    },
    {
      $group: {
        _id: null,
        totalSales: { $sum: "$totalAmount" },
        totalBills: { $sum: 1 },
      },
    },
  ]);
  const reportData = dailySales[0] || { totalSales: 0, totalBills: 0 };

  try {
    await Report.findOneAndUpdate(
      { reportType: "daily_sales", reportDate: targetDate },
      {
        $set: {
          data: reportData,
          generatedBy: req.user._id,
          periodStart: targetDate,
          periodEnd: new Date(nextDay.getTime() - 1),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(
      `Daily Sales Report for ${
        targetDate.toISOString().split("T")[0]
      } generated and/or updated.`
    );
  } catch (error) {
    console.error("Error saving daily report:", error.message);
  }

  res.json(reportData);
});

// @desc    Generate and/or get Monthly Sales Report for a specific month/year or current month
// @route   GET /api/reports/sales/monthly?year=YYYY&month=MM (month is 1-indexed)
// @access  Private/Admin
const getMonthlySalesReport = asyncHandler(async (req, res) => {
  let year, month;
  const now = new Date();

  if (req.query.year && req.query.month) {
    year = parseInt(req.query.year, 10);
    month = parseInt(req.query.month, 10);

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      res.status(400);
      throw new Error(
        "Invalid year or month format. Year must be 4 digits, month must be 1-12."
      );
    }
  } else {
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const existingReport = await Report.findOne({
    reportType: "monthly_sales",
    reportDate: startOfMonth,
  });

  if (existingReport && req.query.generate !== "true") {
    return res.json(existingReport.data);
  }

  const monthlySales = await Bill.aggregate([
    {
      $match: {
        billDate: { $gte: startOfMonth, $lte: endOfMonth },
        paymentStatus: "paid",
      },
    },
    {
      $group: {
        _id: null,
        totalSales: { $sum: "$totalAmount" },
        totalBills: { $sum: 1 },
      },
    },
  ]);
  const reportData = monthlySales[0] || { totalSales: 0, totalBills: 0 };

  try {
    await Report.findOneAndUpdate(
      { reportType: "monthly_sales", reportDate: startOfMonth },
      {
        $set: {
          data: reportData,
          generatedBy: req.user._id,
          periodStart: startOfMonth,
          periodEnd: endOfMonth,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(
      `Monthly Sales Report for ${year}-${month} generated and/or updated.`
    );
  } catch (error) {
    console.error("Error saving monthly report:", error.message);
  }

  res.json(reportData);
});

// @desc    Generate and/or get Most Ordered Dishes report for a specific date range or all time
// @route   GET /api/reports/dishes/most-ordered?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&generate=true
// @access  Private/Admin
const getMostOrderedDishes = asyncHandler(async (req, res) => {
  const matchQuery = { paymentStatus: "paid" };
  let periodStart = null;
  let periodEnd = null;
  let reportKeyDate;

  if (req.query.startDate || req.query.endDate) {
    periodStart = req.query.startDate ? new Date(req.query.startDate) : null;
    periodEnd = req.query.endDate ? new Date(req.query.endDate) : null;

    if (periodStart && isNaN(periodStart.getTime())) {
      res.status(400);
      throw new Error(
        "Invalid startDate format. Please use ISO 8601 YYYY-MM-DD."
      );
    }
    if (periodEnd && isNaN(periodEnd.getTime())) {
      res.status(400);
      throw new Error(
        "Invalid endDate format. Please use ISO 8601 YYYY-MM-DD."
      );
    }

    if (periodStart || periodEnd) {
      matchQuery.billDate = {};
      if (periodStart) {
        periodStart.setHours(0, 0, 0, 0);
        matchQuery.billDate.$gte = periodStart;
      }
      if (periodEnd) {
        periodEnd.setHours(23, 59, 59, 999);
        matchQuery.billDate.$lte = periodEnd;
      }
    }
    reportKeyDate = periodStart || new Date(0);
  } else {
    reportKeyDate = new Date(0);
  }

  const existingReport = await Report.findOne({
    reportType: "most_ordered_dishes",
    reportDate: reportKeyDate,
  });

  if (existingReport && req.query.generate !== "true") {
    return res.json(existingReport.data);
  }

  const mostOrdered = await Bill.aggregate([
    {
      $match: matchQuery,
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.dish",
        totalQuantity: { $sum: "$items.quantity" },
      },
    },
    { $sort: { totalQuantity: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: "dishes",
        localField: "_id",
        foreignField: "_id",
        as: "dishInfo",
      },
    },
    { $unwind: "$dishInfo" },
    {
      $project: {
        _id: 0,
        dishName: "$dishInfo.name",
        totalQuantity: 1,
      },
    },
  ]);
  const reportData = mostOrdered;

  try {
    const findQuery = {
      reportType: "most_ordered_dishes",
      reportDate: reportKeyDate,
    };
    if (periodStart) findQuery.periodStart = periodStart;
    if (periodEnd) findQuery.periodEnd = periodEnd;

    await Report.findOneAndUpdate(
      findQuery,
      {
        $set: {
          data: reportData,
          generatedBy: req.user._id,
          periodStart: periodStart,
          periodEnd: periodEnd,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`Most Ordered Dishes Report generated and/or updated.`);
  } catch (error) {
    if (error.code === 11000) {
      console.warn(
        "Attempted to save duplicate Most Ordered Dishes report:",
        error.message
      );
    } else {
      console.error("Error saving most ordered dishes report:", error.message);
    }
  }

  res.json(reportData);
});

// @desc    Get all stored reports
// @route   GET /api/reports/stored
// @access  Private/Admin
const getStoredReports = asyncHandler(async (req, res) => {
  const { reportType, startDate, endDate } = req.query;
  let query = {};

  if (reportType) {
    query.reportType = reportType;
  }
  if (startDate || endDate) {
    query.reportDate = {};
    if (startDate) {
      query.reportDate.$gte = new Date(startDate);
    }
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      query.reportDate.$lte = endOfDay;
    }
  }

  const reports = await Report.find(query)
    .populate("generatedBy", "name email")
    .sort({ reportDate: -1 });

  res.json(reports);
});

// @desc    Get a specific stored report by ID
// @route   GET /api/reports/stored/:id
// @access  Private/Admin
const getStoredReportById = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id).populate(
    "generatedBy",
    "name email"
  );

  if (report) {
    res.json(report);
  } else {
    res.status(404);
    throw new Error("Stored report not found");
  }
});

// @desc    Delete a specific stored report by ID
// @route   DELETE /api/reports/stored/:id
// @access  Private/Admin
const deleteStoredReport = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id);

  if (report) {
    await report.deleteOne();
    res.json({ message: "Stored report removed successfully" });
  } else {
    res.status(404);
    throw new Error("Stored report not found");
  }
});

module.exports = {
  generateBill,
  getBills,
  getBillById,
  updateBillPaymentStatus,
  splitBill,
  getDailySalesReport,
  getMonthlySalesReport,
  getMostOrderedDishes,
  getStoredReports,
  getStoredReportById,
  deleteStoredReport,
};