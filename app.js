// app.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors'); 
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');
const path = require('path'); 

// Route Imports
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const dishRoutes = require('./routes/dishRoutes');
const orderRoutes = require('./routes/orderRoutes');
const billRoutes = require('./routes/billRoutes');
const reservationRoutes = require('./routes/reservationRoutes');

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors()); // Enable CORS for all origins (or configure specific ones for production)
app.use(express.json()); // Body parser for JSON requests

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Use routes
app.get('/', (req, res) => {
  res.send('Restaurant Management System API is running!');
});
app.use('/api/auth', authRoutes);
app.use('/api/admin/users', userRoutes); // User management is admin-specific
app.use('/api/dishes', dishRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bills', billRoutes); // Billing and Reports
app.use('/api/reservations', reservationRoutes);


// Error Handling Middleware (must be after all routes)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
