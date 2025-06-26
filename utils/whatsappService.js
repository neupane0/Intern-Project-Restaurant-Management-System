// utils/whatsappService.js
const dotenv = require('dotenv');
dotenv.config(); // Load environment variables for Twilio API credentials



const twilio = require('twilio'); 
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN); // Twilio client initialization is now active

/**
 * Sends a WhatsApp message to a customer.
 * @param {string} toPhoneNumber - The recipient's phone number in E.164 format (e.g., '+1234567890').
 * @param {string} messageBody - The content of the WhatsApp message.
 * @returns {Promise<boolean>} - True if message was sent successfully, false otherwise.
 */
const sendWhatsAppMessage = async (toPhoneNumber, messageBody) => {
    // Basic validation for phone number format
    if (!toPhoneNumber || !messageBody) {
        console.error('sendWhatsAppMessage: Missing phone number or message body.');
        return false;
    }
    // Very basic E.164 format check (+ followed by digits, min 10 digits)
    if (!toPhoneNumber.startsWith('+') || toPhoneNumber.length < 10) {
        console.error('sendWhatsAppMessage: Invalid phone number format. Must be E.164 (e.g., +9771234567890).', toPhoneNumber);
        return false;
    }

    // --- WHATSAPP API CALL USING TWILIO ---
    try {
        const message = await client.messages.create({
            body: messageBody,
            from: process.env.TWILIO_WHATSAPP_NUMBER, // Your Twilio WhatsApp enabled number from .env
            to: `whatsapp:${toPhoneNumber}`           // Prefix with 'whatsapp:' for Twilio
        });
        console.log(`WhatsApp message sent successfully via Twilio. SID: ${message.sid}`);
        return true;
    } catch (error) {
        console.error(`Error sending WhatsApp message to ${toPhoneNumber}:`, error.message);
        // Log full error response from Twilio for detailed debugging in development
        if (process.env.NODE_ENV === 'development') {
            console.error('Twilio error details:', error.response ? error.response.data : error);
        }
        return false;
    }
    // Removed the simulation return true; now it will attempt to send via Twilio
};

module.exports = { sendWhatsAppMessage };
