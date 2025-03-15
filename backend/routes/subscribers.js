const express = require('express');
const auth = require('../middleware/auth');
const Subscriber = require('../models/Subscriber');
const ServicePlan = require('../models/ServicePlan');
const { blockClient, unblockClient } = require('../utils/networkControl');
const { sendExpirationWarning } = require('../utils/email');
const router = express.Router();

// Data validation middleware
const validateSubscriber = (req, res, next) => {
  const { 
    subscriberId, name, email, phone, servicePlan,
    subscriptionStartDate, subscriptionEndDate 
  } = req.body;
  
  // Required fields
  if (!subscriberId || !name || !email) {
    return res.status(400).json({ message: 'SubscriberID, name, and email are required' });
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }
  
  // Phone number validation (if provided)
  if (phone) {
    const phoneRegex = /^\+?[0-9]{10,15}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ message: 'Invalid phone number format' });
    }
  }
  
  // Date validation
  const startDate = new Date(subscriptionStartDate);
  const endDate = new Date(subscriptionEndDate);
  
  if (isNaN(startDate.getTime())) {
    return res.status(400).json({ message: 'Invalid subscription start date' });
  }
  
  if (isNaN(endDate.getTime())) {
    return res.status(400).json({ message: 'Invalid subscription end date' });
  }
  
  if (startDate >= endDate) {
    return res.status(400).json({ message: 'Subscription end date must be after start date' });
  }
  
  next();
};

// Get all subscribers - Admin only
router.get('/', auth, async (req, res) => {
  try {
    // Support pagination and filtering
    const { page = 1, limit = 10, status, search } = req.query;
    const skip = (page - 1) * limit;
    
    const filter = {};
    
    // Filter by status if provided
    if (status && ['active', 'inactive', 'pending'].includes(status)) {
      filter.status = status;
    }
    
    // Search by subscriberId, name or email
    if (search) {
      filter.$or = [
        { subscriberId: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get total count for pagination
    const total = await Subscriber.countDocuments(filter);
    
    const subscribers = await Subscriber.find(filter)
      .populate('servicePlan')
      .sort({ subscriptionEndDate: 1 }) // Sort by expiration date (nearest first)
      .skip(skip)
      .limit(parseInt(limit));
      
    // Return with pagination metadata
    res.json({
      subscribers,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalSubscribers: total
    });
  } catch (error) {
    console.error('Error fetching subscribers:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get subscriber by ID - Admin only
router.get('/:id', auth, async (req, res) => {
  try {
    const subscriber = await Subscriber.findById(req.params.id).populate('servicePlan');
    
    if (!subscriber) {
      return res.status(404).json({ message: 'Subscriber not found' });
    }
    
    res.json(subscriber);
  } catch (error) {
    console.error('Error fetching subscriber:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get subscriber by subscriberId - Public route for client lookups
router.get('/lookup/:subscriberId', async (req, res) => {
  try {
    // Find subscriber but don't return sensitive information
    const subscriber = await Subscriber.findOne({ 
      subscriberId: req.params.subscriberId 
    }).select('subscriberId name status subscriptionEndDate servicePlan')
      .populate('servicePlan', 'planName price');
    
    if (!subscriber) {
      return res.status(404).json({ message: 'Subscriber not found' });
    }
    
    res.json(subscriber);
  } catch (error) {
    console.error('Error looking up subscriber:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new subscriber - Admin only
router.post('/', auth, validateSubscriber, async (req, res) => {
  try {
    const { subscriberId, email, servicePlan: planId } = req.body;

    // Check for duplicate subscriber ID or email
    const existingSubscriber = await Subscriber.findOne({ 
      $or: [{ subscriberId }, { email }] 
    });
    
    if (existingSubscriber) {
      return res.status(400).json({ 
        message: existingSubscriber.subscriberId === subscriberId ? 
          'Subscriber ID already exists' : 'Email already registered' 
      });
    }
    
    // Verify service plan exists if specified
    if (planId) {
      const planExists = await ServicePlan.findById(planId);
      if (!planExists) {
        return res.status(400).json({ message: 'Service plan not found' });
      }
    }

    const subscriber = new Subscriber(req.body);
    await subscriber.save();
    
    // Update network access if IP is provided
    if (subscriber.ipAddress) {
      const now = new Date();
      if (new Date(subscriber.subscriptionEndDate) > now && 
          new Date(subscriber.subscriptionStartDate) <= now) {
        subscriber.status = 'active';
        await subscriber.save();
        
        // Unblock IP for active subscribers
        await unblockClient(subscriber.ipAddress, subscriber.subscriberId);
      }
    }
    
    res.status(201).json(subscriber);
  } catch (error) {
    console.error('Error creating subscriber:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update subscriber by ID - Admin only
router.put('/:id', auth, async (req, res) => {
  try {
    const subscriber = await Subscriber.findById(req.params.id);
    if (!subscriber) {
      return res.status(404).json({ message: 'Subscriber not found' });
    }
    
    // Check for unique fields if they're being updated
    if (req.body.email && req.body.email !== subscriber.email) {
      const emailExists = await Subscriber.findOne({ email: req.body.email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }
    
    if (req.body.subscriberId && req.body.subscriberId !== subscriber.subscriberId) {
      const idExists = await Subscriber.findOne({ subscriberId: req.body.subscriberId });
      if (idExists) {
        return res.status(400).json({ message: 'Subscriber ID already exists' });
      }
    }
    
    // Check if service plan exists if it's being updated
    if (req.body.servicePlan) {
      const planExists = await ServicePlan.findById(req.body.servicePlan);
      if (!planExists) {
        return res.status(400).json({ message: 'Service plan not found' });
      }
    }
    
    // Save old IP address for comparison
    const oldIpAddress = subscriber.ipAddress;
    
    // Update subscriber
    Object.assign(subscriber, req.body);
    await subscriber.save();
    
    // Update network access status
    const ipChanged = req.body.ipAddress && req.body.ipAddress !== oldIpAddress;
    const now = new Date();
    const isExpired = subscriber.subscriptionEndDate < now;
    const isActive = !isExpired && subscriber.subscriptionStartDate <= now;
    
    if (subscriber.ipAddress) {
      // Remove old IP access if IP address changed
      if (ipChanged && oldIpAddress) {
        await unblockClient(oldIpAddress, subscriber.subscriberId);
      }
      
      // Set new IP address access based on subscription status
      if (isActive) {
        await unblockClient(subscriber.ipAddress, subscriber.subscriberId);
        subscriber.status = 'active';
      } else {
        await blockClient(subscriber.ipAddress, subscriber.subscriberId);
        subscriber.status = isExpired ? 'inactive' : 'pending';
      }
      
      await subscriber.save();
    }
    
    // Return updated subscriber with populated service plan
    const updatedSubscriber = await Subscriber.findById(subscriber._id).populate('servicePlan');
    res.json(updatedSubscriber);
  } catch (error) {
    console.error('Error updating subscriber:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete subscriber - Admin only
router.delete('/:id', auth, async (req, res) => {
  try {
    const subscriber = await Subscriber.findById(req.params.id);
    if (!subscriber) {
      return res.status(404).json({ message: 'Subscriber not found' });
    }
    
    // Remove network access for this subscriber
    if (subscriber.ipAddress) {
      await unblockClient(subscriber.ipAddress, subscriber.subscriberId);
    }
    
    await Subscriber.findByIdAndDelete(req.params.id);
    res.json({ message: 'Subscriber deleted successfully' });
  } catch (error) {
    console.error('Error deleting subscriber:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Public subscriber registration route
router.post('/register', validateSubscriber, async (req, res) => {
  try {
    const { subscriberId, email, servicePlan: planId } = req.body;
    
    // Check for duplicate subscriber ID or email
    const existingSubscriber = await Subscriber.findOne({ 
      $or: [{ subscriberId }, { email }] 
    });
    
    if (existingSubscriber) {
      return res.status(400).json({ 
        message: existingSubscriber.subscriberId === subscriberId ? 
          'Subscriber ID already exists' : 'Email already registered' 
      });
    }
    
    // Verify service plan exists if specified
    if (planId) {
      const planExists = await ServicePlan.findById(planId);
      if (!planExists) {
        return res.status(400).json({ message: 'Service plan not found' });
      }
    }
    
    // Create subscriber with pending status
    const subscriber = new Subscriber({
      ...req.body,
      status: 'pending'
    });
    
    await subscriber.save();
    
    res.status(201).json({
      message: 'Registration successful. Please complete payment to activate your subscription.',
      subscriberId: subscriber.subscriberId,
      _id: subscriber._id
    });
  } catch (error) {
    console.error('Error registering subscriber:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Check subscription status - Public access
router.get('/status/:subscriberId', async (req, res) => {
  try {
    const subscriber = await Subscriber.findOne({ 
      subscriberId: req.params.subscriberId 
    }).select('subscriberId status subscriptionEndDate');
    
    if (!subscriber) {
      return res.status(404).json({ message: 'Subscriber not found' });
    }
    
    const now = new Date();
    const daysLeft = Math.ceil((subscriber.subscriptionEndDate - now) / (1000 * 60 * 60 * 24));
    
    res.json({
      subscriberId: subscriber.subscriberId,
      status: subscriber.status,
      subscriptionEndDate: subscriber.subscriptionEndDate,
      daysRemaining: daysLeft > 0 ? daysLeft : 0
    });
  } catch (error) {
    console.error('Error checking subscription status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;