// config/db.js
const mongoose = require('mongoose');

let mongoMemoryServerInstance = null;

const connectDB = async () => {
    try {
        let mongoUri = process.env.MONGO_URI;

        // Fallback to in-memory MongoDB for local testing if no MONGO_URI provided
        if (!mongoUri) {
            const { MongoMemoryServer } = require('mongodb-memory-server');
            mongoMemoryServerInstance = await MongoMemoryServer.create();
            mongoUri = mongoMemoryServerInstance.getUri();
            process.env.MONGO_URI = mongoUri; // expose for other modules/tools
            console.log('Using in-memory MongoDB instance for testing.');
        }

        const conn = await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1); // Exit process with failure
    }
};

module.exports = connectDB;