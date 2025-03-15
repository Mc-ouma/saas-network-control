const mongoose = require('mongoose');

const billingSchema = new mongoose.Schema({
  subscriber: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscriber', required: true },
  amount: { type: Number, required: true },
  paymentDate: { type: Date, required: true },
  paymentMethod: { type: String, enum: ['credit_card', 'paypal', 'bank_transfer'], required: true },
  transactionId: { type: String, required: true },
  status: { type: String, enum: ['paid', 'failed', 'pending'], default: 'pending' },
});

module.exports = mongoose.model('Billing', billingSchema);
