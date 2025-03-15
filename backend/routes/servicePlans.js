const express = require('express');
const auth = require('../middleware/auth');
const ServicePlan = require('../models/ServicePlan');
const Subscriber = require('../models/Subscriber');
const router = express.Router();

// Validate service plan data
const validateServicePlan = (req, res, next) => {
  const { planName, price, durationInMonths } = req.body;
  
  if (!planName) {
    return res.status(400).json({ message: 'Plan name is required' });
  }
  
  if (!price || isNaN(price) || price <= 0) {
    return res.status(400).json({ message: 'Price must be a positive number' });
  }
  
  if (!durationInMonths || isNaN(durationInMonths) || durationInMonths <= 0) {
    return res.status(400).json({ message: 'Duration must be a positive number' });
  }
  
  next();
};

// Get all service plans - Public access
router.get('/', async (req, res) => {
  try {
    // Support basic filtering and sorting
    const { active, sort } = req.query;
    
    const query = active === 'true' ? { isActive: true } : {};
    let sortOption = { price: 1 }; // Default sort by price ascending
    
    if (sort === 'price-desc') {
      sortOption = { price: -1 };
    } else if (sort === 'duration') {
      sortOption = { durationInMonths: 1 };
    } else if (sort === 'duration-desc') {
      sortOption = { durationInMonths: -1 };
    } else if (sort === 'name') {
      sortOption = { planName: 1 };
    }
    
    const servicePlans = await ServicePlan.find(query).sort(sortOption);
    res.json(servicePlans);
  } catch (error) {
    console.error('Error fetching service plans:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get service plan by ID - Public access
router.get('/:id', async (req, res) => {
  try {
    const servicePlan = await ServicePlan.findById(req.params.id);
    
    if (!servicePlan) {
      return res.status(404).json({ message: 'Service plan not found' });
    }
    
    // Get subscriber count for this plan
    const subscriberCount = await Subscriber.countDocuments({ servicePlan: servicePlan._id });
    
    res.json({
      ...servicePlan.toJSON(),
      subscriberCount
    });
  } catch (error) {
    console.error('Error fetching service plan:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create new service plan - Admin only
router.post('/', auth, validateServicePlan, async (req, res) => {
  try {
    const { planName } = req.body;
    
    // Check for duplicate plan name
    const existingPlan = await ServicePlan.findOne({ planName });
    if (existingPlan) {
      return res.status(400).json({ message: 'A service plan with this name already exists' });
    }
    
    // Add default isActive if not provided
    const servicePlanData = {
      ...req.body,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true
    };
    
    const servicePlan = new ServicePlan(servicePlanData);
    await servicePlan.save();
    
    res.status(201).json(servicePlan);
  } catch (error) {
    console.error('Error creating service plan:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update service plan - Admin only
router.put('/:id', auth, validateServicePlan, async (req, res) => {
  try {
    const servicePlan = await ServicePlan.findById(req.params.id);
    if (!servicePlan) {
      return res.status(404).json({ message: 'Service plan not found' });
    }
    
    // Check for duplicate plan name if name is changing
    if (req.body.planName && req.body.planName !== servicePlan.planName) {
      const nameExists = await ServicePlan.findOne({ planName: req.body.planName });
      if (nameExists) {
        return res.status(400).json({ message: 'Plan name already exists' });
      }
    }
    
    // Update service plan fields
    Object.keys(req.body).forEach(key => {
      servicePlan[key] = req.body[key];
    });
    
    await servicePlan.save();
    res.json(servicePlan);
  } catch (error) {
    console.error('Error updating service plan:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete service plan - Admin only
router.delete('/:id', auth, async (req, res) => {
  try {
    const servicePlan = await ServicePlan.findById(req.params.id);
    if (!servicePlan) {
      return res.status(404).json({ message: 'Service plan not found' });
    }
    
    // Check if plan is assigned to any subscribers
    const subscriberCount = await Subscriber.countDocuments({ servicePlan: req.params.id });
    if (subscriberCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete: this plan is currently assigned to ${subscriberCount} subscribers` 
      });
    }
    
    await ServicePlan.findByIdAndDelete(req.params.id);
    res.json({ message: 'Service plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting service plan:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update service plan to inactive instead of deleting - Admin only
router.put('/:id/deactivate', auth, async (req, res) => {
  try {
    const servicePlan = await ServicePlan.findById(req.params.id);
    if (!servicePlan) {
      return res.status(404).json({ message: 'Service plan not found' });
    }
    
    servicePlan.isActive = false;
    await servicePlan.save();
    
    res.json({ 
      message: 'Service plan deactivated successfully',
      servicePlan
    });
  } catch (error) {
    console.error('Error deactivating service plan:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;