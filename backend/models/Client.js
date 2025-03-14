const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  clientId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  ipAddress: { type: String, required: true },
  subscriptionEndDate: { type: Date, required: true }
});

module.exports = mongoose.model('Client', clientSchema);