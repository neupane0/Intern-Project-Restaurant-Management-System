const asyncHandler = require('express-async-handler');
const Dish = require('../models/Dish');
const path = require('path');
const fs = require('fs').promises; // Use the promise-based fs module for non-blocking I/O

/**
 * @desc    Create a new dish
 * @route   POST /api/dishes
 * @access  Private (Admin/Chef)
 */
const createDish = asyncHandler(async (req, res) => {
    // Destructure dietaryRestrictions 
    const { 
        name, 
        description, 
        price, 
        category, 
        isAvailable, 
        dietaryRestrictions,
        isSpecial,
        specialPrice,
        specialStartDate,
        specialEndDate
     } = req.body;

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';
    const parsedPrice = parseFloat(price);

    // Use a helper function for file deletion to avoid repetition
    const deleteUploadedFile = async (filePath) => {
        if (filePath) {
            try {
                await fs.unlink(filePath);
            } catch (err) {
                console.error('Error deleting incomplete upload:', err);
            }
        }
    };

    if (!name || !price) {
        await deleteUploadedFile(req.file ? req.file.path : null);
        res.status(400);
        throw new Error('Dish name and price are required.');
    }

    if (isNaN(parsedPrice) || parsedPrice < 0) {
        await deleteUploadedFile(req.file ? req.file.path : null);
        res.status(400);
        throw new Error('Price must be a non-negative number.');
    }

    const dishExists = await Dish.findOne({ name });
    if (dishExists) {
        await deleteUploadedFile(req.file ? req.file.path : null);
        res.status(400);
        throw new Error(`Dish with name "${name}" already exists.`);
    }

    // Validate dietaryRestrictions if provided 
    if (dietaryRestrictions && !Array.isArray(dietaryRestrictions)) {
        res.status(400);
        throw new Error('Dietary restrictions must be an array.');
    }

    const specialPriceValue = isSpecial ? parseFloat(specialPrice) : undefined;
    const dish = await Dish.create({
        name,
        description,
        price: parsedPrice,
        category,
        isAvailable,
        imageUrl,
        dietaryRestrictions: dietaryRestrictions || [], 
        isSpecial,
        specialPrice: isSpecial ? specialPriceValue : undefined,
        specialDateRange: {
            start: isSpecial ? specialStartDate : undefined,
            end: isSpecial ? specialEndDate : undefined,
        }
    });

    res.status(201).json(dish);
});

/**
 * @desc    Get all dishes
 * @route   GET /api/dishes
 * @access  Public (Anyone can view menu) - or Private if only for staff
 */
const getDishes = asyncHandler(async (req, res) => {
    const dishes = await Dish.find({});
    res.json(dishes);
});

/**
 * @desc    Get single dish by ID
 * @route   GET /api/dishes/:id
 * @access  Public (Anyone can view menu)
 */
const getDishById = asyncHandler(async (req, res) => {
    const dish = await Dish.findById(req.params.id);

    if (dish) {
        res.json(dish);
    } else {
        res.status(404);
        throw new Error('Dish not found.');
    }
});

/**
 * @desc    Update a dish
 * @route   PUT /api/dishes/:id
 * @access  Private (Admin/Chef)
 */
const updateDish = asyncHandler(async (req, res) => {
    // Destructure dietaryRestrictions 
    const { 
        name, 
        description, 
        price, 
        category, 
        isAvailable, 
        dietaryRestrictions,
        isSpecial,
        specialPrice,
        specialStartDate,
        specialEndDate
     } = req.body;
    let newImageUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.imageUrl || '');

    const dish = await Dish.findById(req.params.id);

    // Use a helper function for file deletion to avoid repetition
    const deleteUploadedFile = async (filePath) => {
        if (filePath) {
            try {
                await fs.unlink(filePath);
            } catch (err) {
                console.error('Error deleting uploaded file:', err);
            }
        }
    };

    if (dish) {
        if (req.file && dish.imageUrl && dish.imageUrl.startsWith('/uploads/')) {
            const oldFilePath = path.join(__dirname, '..', dish.imageUrl);
            await deleteUploadedFile(oldFilePath);
        }

        const updatedName = name !== undefined ? name : dish.name;
        dish.description = description !== undefined ? description : dish.description;
        dish.price = price !== undefined ? parseFloat(price) : dish.price;
        dish.category = category !== undefined ? category : dish.category;
        dish.isAvailable = isAvailable !== undefined ? isAvailable : dish.isAvailable;
        dish.imageUrl = newImageUrl;
        dish.isSpecial = isSpecial !== undefined ? isSpecial : dish.isSpecial;
        
        if (isSpecial !== undefined) {
             dish.specialPrice = isSpecial ? parseFloat(specialPrice) : undefined;
             dish.specialDateRange.start = isSpecial ? specialStartDate : undefined;
             dish.specialDateRange.end = isSpecial ? specialEndDate : undefined;
        }


        if (dietaryRestrictions !== undefined) {
             if (!Array.isArray(dietaryRestrictions)) {
                res.status(400);
                throw new Error('Dietary restrictions must be an array.');
            }
            dish.dietaryRestrictions = dietaryRestrictions;
        }

        if (updatedName !== dish.name) {
            const dishExists = await Dish.findOne({ name: updatedName });
            if (dishExists && dishExists._id.toString() !== dish._id.toString()) {
                await deleteUploadedFile(req.file ? req.file.path : null);
                res.status(400);
                throw new Error(`Dish with name "${updatedName}" already exists.`);
            }
            dish.name = updatedName;
        }

        const updatedDish = await dish.save();
        res.json(updatedDish);
    } else {
        await deleteUploadedFile(req.file ? req.file.path : null);
        res.status(404);
        throw new Error('Dish not found.');
    }
});

/**
 * @desc    Delete a dish
 * @route   DELETE /api/dishes/:id
 * @access  Private (Admin/Chef)
 */
const deleteDish = asyncHandler(async (req, res) => {
    const dish = await Dish.findById(req.params.id);

    if (dish) {
        if (dish.imageUrl && dish.imageUrl.startsWith('/uploads/')) {
            const filePath = path.join(__dirname, '..', dish.imageUrl);
            try {
                await fs.unlink(filePath);
            } catch (err) {
                console.error('Failed to delete image file:', filePath, err);
            }
        }
        await dish.deleteOne();
        res.json({ message: 'Dish removed successfully.' });
    } else {
        res.status(404);
        throw new Error('Dish not found.');
    }
});

/**
 * @desc    Toggle dish availability (isAvailable status)
 * @route   PUT /api/dishes/:id/toggle-availability
 * @access  Private (Admin/Chef)
 */
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

/**
 * @desc    Toggle dish special status
 * @route   PUT /api/dishes/:id/toggle-special
 * @access  Private (Admin/Chef)
 */
const toggleDishSpecial = asyncHandler(async (req, res) => {
    const dish = await Dish.findById(req.params.id);
    const { specialPrice, specialStartDate, specialEndDate } = req.body;

    if (dish) {
        dish.isSpecial = !dish.isSpecial;

        if (dish.isSpecial) {
            if (!specialPrice || !specialStartDate || !specialEndDate) {
                res.status(400);
                throw new Error('Special price, start date, and end date are required to make a dish special.');
            }
            dish.specialPrice = parseFloat(specialPrice);
            dish.specialDateRange.start = specialStartDate;
            dish.specialDateRange.end = specialEndDate;
        } else {
            dish.specialPrice = undefined;
            dish.specialDateRange.start = undefined;
            dish.specialDateRange.end = undefined;
        }
        const updatedDish = await dish.save();
        res.json({
            _id: updatedDish._id,
            name: updatedDish.name,
            isSpecial: updatedDish.isSpecial,
            message: `Dish "${updatedDish.name}" special status toggled to ${updatedDish.isSpecial ? 'on' : 'off'}.`
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
    toggleDishSpecial,
};
