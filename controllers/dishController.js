// controllers/dishController.js
const asyncHandler = require('express-async-handler');
const Dish = require('../models/Dish');

// @desc    Add a new dish
// @route   POST /api/dishes
// @access  Private/Chef, Admin
const addDish = asyncHandler(async (req, res) => {
    const { name, description, price, category, isAvailable, imageUrl } = req.body;

    const dishExists = await Dish.findOne({ name });
    if (dishExists) {
        res.status(400);
        throw new Error('Dish with this name already exists');
    }

    const dish = await Dish.create({ name, description, price, category, isAvailable, imageUrl });
    res.status(201).json(dish);
});

// @desc    Get all dishes
// @route   GET /api/dishes
// @access  Public (or Private to all authenticated users)
const getDishes = asyncHandler(async (req, res) => {
    const dishes = await Dish.find({});
    res.json(dishes);
});

// @desc    Get single dish by ID
// @route   GET /api/dishes/:id
// @access  Public (or Private to all authenticated users)
const getDishById = asyncHandler(async (req, res) => {
    const dish = await Dish.findById(req.params.id);
    if (dish) {
        res.json(dish);
    } else {
        res.status(404);
        throw new Error('Dish not found');
    }
});

// @desc    Update a dish
// @route   PUT /api/dishes/:id
// @access  Private/Chef, Admin
const updateDish = asyncHandler(async (req, res) => {
    const { name, description, price, category, isAvailable, imageUrl } = req.body;
    const dish = await Dish.findById(req.params.id);

    if (dish) {
        dish.name = name || dish.name;
        dish.description = description || dish.description;
        dish.price = price || dish.price;
        dish.category = category || dish.category;
        dish.isAvailable = (isAvailable !== undefined) ? isAvailable : dish.isAvailable;
        dish.imageUrl = imageUrl || dish.imageUrl;

        const updatedDish = await dish.save();
        res.json(updatedDish);
    } else {
        res.status(404);
        throw new Error('Dish not found');
    }
});

// @desc    Delete a dish
// @route   DELETE /api/dishes/:id
// @access  Private/Chef, Admin
const deleteDish = asyncHandler(async (req, res) => {
    const dish = await Dish.findById(req.params.id);
    if (dish) {
        await dish.deleteOne();
        res.json({ message: 'Dish removed' });
    } else {
        res.status(404);
        throw new Error('Dish not found');
    }
});

module.exports = { addDish, getDishes, getDishById, updateDish, deleteDish };