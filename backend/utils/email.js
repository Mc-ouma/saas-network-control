const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendExpirationWarning = async (email, name, daysLeft) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Subscription Expiration Warning',
    text: `Dear ${name}, your subscription expires in ${daysLeft} days. Please renew to avoid losing network access.`,
  };
  await transporter.sendMail(mailOptions);
};

module.exports = { sendExpirationWarning };