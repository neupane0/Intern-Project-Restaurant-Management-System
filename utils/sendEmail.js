const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();

const sendEmail = async (options)  => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_PORT == 465,
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD,
        },
        tls: {
            rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false,
        },
    });

      const mailOptions = {
    from: `${process.env.FROM_NAME} <${process.env.SMTP_EMAIL}>`, // Sender address
    to: options.email,       // Recipient address
    subject: options.subject, // Subject line
    html: options.message,   // HTML body (or text: options.message for plain text)
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId}`);
  } catch (error) {
    console.error(`Error sending email to ${options.email}:`, error);
    throw new Error('Email could not be sent'); // Re-throw to be caught by asyncHandler
  }
};

module.exports = sendEmail;