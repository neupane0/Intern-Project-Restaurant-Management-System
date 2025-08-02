// utils/upload.js
const multer = require('multer');
const path = require('path'); // Node.js built-in module for path manipulation

// Define storage for images
const storage = multer.diskStorage({
    // Destination to store image files
    destination: (req, file, cb) => {
        // 'uploads/' is the directory where images will be stored.
        // Make sure this directory exists in your project root.
        cb(null, 'uploads/');
    },
    // Define the filename for the uploaded image
    filename: (req, file, cb) => {
        // Generate a unique filename: fieldname-timestamp.ext
        // Example: dishImage-1678888888888.jpeg
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

// Filter for image files
const fileFilter = (req, file, cb) => {
    // Check file type to ensure it's an image
    // FIX: Changed 'immage/' to 'image/'
    if (file.mimetype.startsWith('image/')) {
        cb(null, true); // Accept the file
    } else {
        // Reject the file if it's not an image
        cb(new Error('Only image files are allowed!'), false);
    }
};

// Initialize multer upload middleware
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1024 * 1024 * 5 // Limit file size to 5MB (optional but recommended)
        // Compress The image
    }
});

module.exports = upload;
