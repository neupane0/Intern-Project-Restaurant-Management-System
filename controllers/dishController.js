// controllers/dishController.js
const asyncHandler = require('express-async-handler');
const Dish = require('../models/Dish');
const path = require('path'); // Needed if you plan to delete files later, but good to have.
const fs = require('fs'); // Needed if you plan to delete files later.


// @desc    Create a new dish
// @route   POST /api/dishes
// @access  Private (Admin/Chef)
const createDish = asyncHandler(async (req, res) => {
    const { name, description, price, category, isAvailable } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';

    if (!name || !price) {
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting incomplete upload:', err);
            });
        }
        res.status(400);
        throw new Error('Dish name and price are required.');
    }
    if (typeof parseFloat(price) !== 'number' || parseFloat(price) < 0) {
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting incomplete upload:', err);
            });
        }
        res.status(400);
        throw new Error('Price must be a non-negative number.');
    }

    const dishExists = await Dish.findOne({ name });
    if (dishExists) {
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting duplicate upload:', err);
            });
        }
        res.status(400);
        throw new Error(`Dish with name "${name}" already exists.`);
    }

    const dish = await Dish.create({
        name,
        description,
        price: parseFloat(price),
        category,
        isAvailable,
        imageUrl,
    });

    res.status(201).json(dish);
});

// @desc    Get all dishes
// @route   GET /api/dishes
// @access  Public (Anyone can view menu) - or Private if only for staff
const getDishes = asyncHandler(async (req, res) => {
    const dishes = await Dish.find({});
    res.json(dishes);
});

// @desc    Get single dish by ID
// @route   GET /api/dishes/:id
// @access  Public (Anyone can view menu)
const getDishById = asyncHandler(async (req, res) => {
    const dish = await Dish.findById(req.params.id);

    if (dish) {
        res.json(dish);
    } else {
        res.status(404);
        throw new Error('Dish not found.');
    }
});

// @desc    Update a dish
// @route   PUT /api/dishes/:id
// @access  Private (Admin/Chef)
const updateDish = asyncHandler(async (req, res) => {
    const { name, description, price, category, isAvailable } = req.body;
    let newImageUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.imageUrl || '');

    const dish = await Dish.findById(req.params.id);

    if (dish) {
        if (req.file && dish.imageUrl && dish.imageUrl.startsWith('/uploads/')) {
            const oldFilePath = path.join(__dirname, '..', dish.imageUrl);
            fs.unlink(oldFilePath, (err) => {
                if (err) console.error('Error deleting old image file:', oldFilePath, err);
            });
        }

        const updatedName = name !== undefined ? name : dish.name;
        dish.description = description !== undefined ? description : dish.description;
        dish.price = price !== undefined ? parseFloat(price) : dish.price;
        dish.category = category !== undefined ? category : dish.category;
        dish.isAvailable = isAvailable !== undefined ? isAvailable : dish.isAvailable;
        dish.imageUrl = newImageUrl;

        if (updatedName !== dish.name) {
            const dishExists = await Dish.findOne({ name: updatedName });
            if (dishExists && dishExists._id.toString() !== dish._id.toString()) {
                if (req.file) {
                    fs.unlink(req.file.path, (err) => {
                        if (err) console.error('Error deleting conflict upload:', err);
                    });
                }
                res.status(400);
                throw new Error(`Dish with name "${updatedName}" already exists.`);
            }
            dish.name = updatedName;
        }

        const updatedDish = await dish.save();
        res.json(updatedDish);
    } else {
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting orphaned upload:', err);
            });
        }
        res.status(404);
        throw new Error('Dish not found.');
    }
});

// @desc    Delete a dish
// @route   DELETE /api/dishes/:id
// @access  Private (Admin/Chef)
const deleteDish = asyncHandler(async (req, res) => {
    const dish = await Dish.findById(req.params.id);

    if (dish) {
        if (dish.imageUrl && dish.imageUrl.startsWith('/uploads/')) {
            const filePath = path.join(__dirname, '..', dish.imageUrl);
            fs.unlink(filePath, (err) => {
                if (err) console.error('Failed to delete image file:', filePath, err);
            });
        }

        await dish.deleteOne();
        res.json({ message: 'Dish removed successfully.' });
    } else {
        res.status(404);
        throw new Error('Dish not found.');
    }
});

// @desc    Toggle dish availability (isAvailable status)
// @route   PUT /api/dishes/:id/toggle-availability
// @access  Private (Admin/Chef)
const toggleDishAvailability = asyncHandler(async (req, res) => {
    const dish = await Dish.findById(req.params.id);

    if (dish) {
        // Toggle the current status
        dish.isAvailable = !dish.isAvailable;
        const updatedDish = await dish.save();
        res.json({
            _id: updatedDish._id,
            name: updatedDish.name,
            isAvailable: updatedDish.isAvailable,
            message: `Dish "${updatedDish.name}" availability toggled to ${updatedDish.isAvailable ? 'available' : 'unavailable'}.`
        });
    } else {
        res.status(404);
        throw new Error('Dish not found.');
    }
});


module.exports = {
    createDish,
    getDishes,
    getDishById,
    updateDish,
    deleteDish,
    toggleDishAvailability,
};
