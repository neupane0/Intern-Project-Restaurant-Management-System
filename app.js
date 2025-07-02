// app.js
const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Route Imports
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const dishRoutes = require('./routes/dishRoutes');
const orderRoutes = require('./routes/orderRoutes');
const billRoutes = require('./routes/billRoutes');

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(express.json()); // Body parser for JSON requests



// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/admin/users', userRoutes); // User management is admin-specific
app.use('/api/dishes', dishRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bills', billRoutes); // Billing and Reports

// Error Handling Middleware (must be after all routes)
app.use(notFound);
app.use(errorHandler);

module.exports = app;