const mongoose = require('mongoose');

const networkDeviceSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, unique: true },
  deviceName: { type: String, required: true },
  ipAddress: { type: String, required: true },
  location: { type: String },
  status: { type: String, enum: ['online', 'offline', 'maintenance'], default: 'offline' },
  assignedSubscriber: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscriber' },
});

module.exports = mongoose.model('NetworkDevice', networkDeviceSchema);
