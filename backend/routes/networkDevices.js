const express = require('express');
const auth = require('../middleware/auth');
const NetworkDevice = require('../models/NetworkDevice');
const { executeSSHCommand } = require('../utils/networkControl');
const router = express.Router();

// Get all network devices - Admin only
router.get('/', auth, async (req, res) => {
  try {
    const devices = await NetworkDevice.find().populate('assignedSubscriber');
    res.json(devices);
  } catch (error) {
    console.error('Error fetching network devices:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get network device by ID - Admin only
router.get('/:id', auth, async (req, res) => {
  try {
    const device = await NetworkDevice.findById(req.params.id).populate('assignedSubscriber');
    if (!device) return res.status(404).json({ message: 'Network device not found' });
    res.json(device);
  } catch (error) {
    console.error('Error fetching network device:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new network device - Admin only
router.post('/', auth, async (req, res) => {
  try {
    const { deviceId, ipAddress } = req.body;
    
    // Check if device with same ID or IP already exists
    const existingDevice = await NetworkDevice.findOne({ 
      $or: [{ deviceId }, { ipAddress }] 
    });
    
    if (existingDevice) {
      return res.status(400).json({ 
        message: existingDevice.deviceId === deviceId ? 
          'Device ID already exists' : 'IP address already registered' 
      });
    }
    
    const device = new NetworkDevice(req.body);
    await device.save();
    res.status(201).json(device);
  } catch (error) {
    console.error('Error creating network device:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Update network device - Admin only
router.put('/:id', auth, async (req, res) => {
  try {
    const device = await NetworkDevice.findById(req.params.id);
    if (!device) return res.status(404).json({ message: 'Network device not found' });
    
    // If deviceId or ipAddress is being changed, check they don't conflict
    if (req.body.deviceId && req.body.deviceId !== device.deviceId) {
      const idExists = await NetworkDevice.findOne({ deviceId: req.body.deviceId });
      if (idExists) return res.status(400).json({ message: 'Device ID already exists' });
    }
    
    if (req.body.ipAddress && req.body.ipAddress !== device.ipAddress) {
      const ipExists = await NetworkDevice.findOne({ ipAddress: req.body.ipAddress });
      if (ipExists) return res.status(400).json({ message: 'IP address already registered' });
    }
    
    Object.assign(device, req.body);
    await device.save();
    res.json(device);
  } catch (error) {
    console.error('Error updating network device:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete network device - Admin only
router.delete('/:id', auth, async (req, res) => {
  try {
    const device = await NetworkDevice.findById(req.params.id);
    if (!device) return res.status(404).json({ message: 'Network device not found' });
    
    await NetworkDevice.findByIdAndDelete(req.params.id);
    res.json({ message: 'Network device deleted' });
  } catch (error) {
    console.error('Error deleting network device:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check device status (ping) - Admin only
router.get('/:id/status', auth, async (req, res) => {
  try {
    const device = await NetworkDevice.findById(req.params.id);
    if (!device) return res.status(404).json({ message: 'Network device not found' });
    
    // Attempt to ping the device
    try {
      const pingCommand = `ping -c 3 ${device.ipAddress}`;
      const pingResult = await executeSSHCommand(pingCommand);
      
      // Update device status based on ping result
      if (pingResult.code === 0) {
        device.status = 'online';
      } else {
        device.status = 'offline';
      }
      
      await device.save();
      
      res.json({
        device,
        status: device.status,
        pingOutput: pingResult.output
      });
    } catch (sshError) {
      console.error('SSH command error:', sshError);
      res.status(500).json({ message: 'Failed to check device status', error: sshError.message });
    }
  } catch (error) {
    console.error('Error checking network device status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Assign subscriber to device - Admin only
router.post('/:id/assign', auth, async (req, res) => {
  try {
    const { subscriberId } = req.body;
    const device = await NetworkDevice.findById(req.params.id);
    if (!device) return res.status(404).json({ message: 'Network device not found' });
    
    const Subscriber = require('../models/Subscriber');
    const subscriber = await Subscriber.findOne({ subscriberId });
    if (!subscriber) return res.status(404).json({ message: 'Subscriber not found' });
    
    // Update device with assigned subscriber
    device.assignedSubscriber = subscriber._id;
    await device.save();
    
    res.json({
      message: 'Subscriber assigned to device successfully',
      device: await device.populate('assignedSubscriber')
    });
  } catch (error) {
    console.error('Error assigning subscriber to device:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;