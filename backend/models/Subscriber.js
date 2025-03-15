const mongoose = require('mongoose');

const subscriberSchema = new mongoose.Schema({
  subscriberId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  address: { type: String },
  servicePlan: { type: mongoose.Schema.Types.ObjectId, ref: 'ServicePlan' },
  subscriptionStartDate: { type: Date, required: true },
  subscriptionEndDate: { type: Date, required: true },
  status: { type: String, enum: ['active', 'inactive', 'pending'], default: 'pending' },
});

module.exports = mongoose.model('Subscriber', subscriberSchema);
