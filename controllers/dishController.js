// controllers/dishController.js
const asyncHandler = require('express-async-handler');
const Dish = require('../models/Dish'); // Import the Dish model
const path = require('path'); // Needed if you plan to delete files later, but good to have.
const fs = require('fs'); // Needed if you plan to delete files later.


// @desc    Create a new dish
// @route   POST /api/dishes
// @access  Private (Admin/Chef)
const createDish = asyncHandler(async (req, res) => {
    // Destructure fields from req.body (text fields from form-data)
    const { name, description, price, category, isAvailable } = req.body;

    // req.file will be populated by multer if an image was uploaded
    // Construct the imageUrl path using the filename provided by multer
    // If no file is uploaded, imageUrl will be an empty string
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';

    // Basic validation
    if (!name || !price) {
        // If an image was uploaded but other required fields are missing, delete the uploaded file
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting incomplete upload:', err);
            });
        }
        res.status(400);
        throw new Error('Dish name and price are required.');
    }
    if (typeof parseFloat(price) !== 'number' || parseFloat(price) < 0) { // Ensure price is a valid number
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting incomplete upload:', err);
            });
        }
        res.status(400);
        throw new Error('Price must be a non-negative number.');
    }

    // Check if a dish with the same name already exists
    const dishExists = await Dish.findOne({ name });
    if (dishExists) {
        // If an image was uploaded but dish name exists, delete the uploaded file
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
        price: parseFloat(price), // Convert price to number
        category,
        isAvailable,
        imageUrl, // Save the constructed image URL/path
    });

    res.status(201).json(dish); // Respond with the created dish
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
    // Destructure fields from req.body (text fields from form-data)
    const { name, description, price, category, isAvailable } = req.body;

    // Determine the imageUrl:
    // If a new file is uploaded (req.file exists), use its path.
    // Otherwise, if req.body.imageUrl is provided (e.g., frontend sends back existing URL), use that.
    // Otherwise, keep the existing dish.imageUrl.
    let newImageUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.imageUrl || '');

    const dish = await Dish.findById(req.params.id);

    if (dish) {
        // Handle old image deletion if a new one is uploaded
        if (req.file && dish.imageUrl && dish.imageUrl.startsWith('/uploads/')) {
            const oldFilePath = path.join(__dirname, '..', dish.imageUrl);
            fs.unlink(oldFilePath, (err) => {
                if (err) console.error('Error deleting old image file:', oldFilePath, err);
            });
        }

        // Update fields only if they are provided in the request body
        const updatedName = name !== undefined ? name : dish.name;
        dish.description = description !== undefined ? description : dish.description;
        dish.price = price !== undefined ? parseFloat(price) : dish.price; // Convert price to number
        dish.category = category !== undefined ? category : dish.category;
        dish.isAvailable = isAvailable !== undefined ? isAvailable : dish.isAvailable;
        dish.imageUrl = newImageUrl; // Update the imageUrl

        // Re-check uniqueness if name is updated AND it's different from current name
        if (updatedName !== dish.name) {
            const dishExists = await Dish.findOne({ name: updatedName });
            if (dishExists && dishExists._id.toString() !== dish._id.toString()) {
                // If a new image was uploaded for this update, delete it due to name conflict
                if (req.file) {
                    fs.unlink(req.file.path, (err) => {
                        if (err) console.error('Error deleting conflict upload:', err);
                    });
                }
                res.status(400);
                throw new Error(`Dish with name "${updatedName}" already exists.`);
            }
            dish.name = updatedName; // Assign the new name only after uniqueness check
        }

        const updatedDish = await dish.save();
        res.json(updatedDish);
    } else {
        // If dish not found, and a file was uploaded, delete it
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
        // Optional: Delete the actual image file from 'uploads/' directory if it exists
        // This requires 'fs' module and careful error handling
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

module.exports = {
    createDish, // Renamed from addDish for consistency with RESTful POST
    getDishes,
    getDishById,
    updateDish,
    deleteDish,
};
