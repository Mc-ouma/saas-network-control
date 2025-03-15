const mongoose = require('mongoose');

const servicePlanSchema = new mongoose.Schema({
  planName: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  durationInMonths: { type: Number, required: true },
});

module.exports = mongoose.model('ServicePlan', servicePlanSchema);
