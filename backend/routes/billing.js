const express = require('express');
const auth = require('../middleware/auth');
const Billing = require('../models/Billing');
const Subscriber = require('../models/Subscriber');
const ServicePlan = require('../models/ServicePlan');
const { unblockClient } = require('../utils/networkControl');
const { initiateSTKPush, checkTransactionStatus } = require('../utils/mpesa');
const router = express.Router();

// Validate payment data
const validatePayment = (req, res, next) => {
  const { subscriberId, amount, paymentMethod } = req.body;
  
  if (!subscriberId) {
    return res.status(400).json({ message: 'Subscriber ID is required' });
  }
  
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: 'Amount must be a positive number' });
  }
  
  if (!paymentMethod) {
    return res.status(400).json({ message: 'Payment method is required' });
  }
  
  const allowedPaymentMethods = ['mpesa', 'credit_card', 'paypal', 'bank_transfer'];
  if (!allowedPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({ message: 'Invalid payment method' });
  }
  
  next();
};

// Store checkout requests temporarily for M-Pesa verification
const pendingCheckouts = new Map();

// Get billing records - Admin only
router.get('/', auth, async (req, res) => {
  try {
    // Support pagination and filtering
    const { page = 1, limit = 20, status, method, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;
    
    const filter = {};
    
    // Filter by status
    if (status && ['paid', 'failed', 'pending'].includes(status)) {
      filter.status = status;
    }
    
    // Filter by payment method
    if (method) {
      filter.paymentMethod = method;
    }
    
    // Filter by date range
    if (startDate || endDate) {
      filter.paymentDate = {};
      if (startDate) filter.paymentDate.$gte = new Date(startDate);
      if (endDate) filter.paymentDate.$lte = new Date(endDate);
    }
    
    // Get total count for pagination
    const total = await Billing.countDocuments(filter);
    
    const billingRecords = await Billing.find(filter)
      .populate({
        path: 'subscriber',
        select: 'subscriberId name email'
      })
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    res.json({
      billingRecords,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      totalRecords: total
    });
  } catch (error) {
    console.error('Error fetching billing records:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get billing record by ID - Admin only
router.get('/:id', auth, async (req, res) => {
  try {
    const billingRecord = await Billing.findById(req.params.id)
      .populate('subscriber');
    
    if (!billingRecord) {
      return res.status(404).json({ message: 'Billing record not found' });
    }
    
    res.json(billingRecord);
  } catch (error) {
    console.error('Error fetching billing record:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get subscriber billing history - Admin or matching subscriber ID
router.get('/subscriber/:subscriberId', auth, async (req, res) => {
  try {
    const subscriber = await Subscriber.findOne({ subscriberId: req.params.subscriberId });
    if (!subscriber) return res.status(404).json({ message: 'Subscriber not found' });
    
    const billingRecords = await Billing.find({ subscriber: subscriber._id })
      .sort({ paymentDate: -1 });
    res.json(billingRecords);
  } catch (error) {
    console.error('Error fetching subscriber billing history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new payment record - Admin only
router.post('/', auth, validatePayment, async (req, res) => {
  try {
    const { subscriberId, amount, paymentMethod, transactionId } = req.body;
    
    // Find subscriber
    const subscriber = await Subscriber.findOne({ subscriberId });
    if (!subscriber) return res.status(404).json({ message: 'Subscriber not found' });
    
    // Create billing record
    const billing = new Billing({
      subscriber: subscriber._id,
      amount,
      paymentDate: new Date(),
      paymentMethod,
      transactionId,
      status: 'paid'
    });
    
    await billing.save();
    
    // Update subscriber subscription dates if needed
    if (subscriber.status !== 'active') {
      const servicePlan = await ServicePlan.findById(subscriber.servicePlan);
      if (!servicePlan) {
        return res.status(400).json({ message: 'Subscriber has no associated service plan' });
      }
      
      const now = new Date();
      subscriber.subscriptionStartDate = now;
      subscriber.subscriptionEndDate = new Date(now.setMonth(now.getMonth() + servicePlan.durationInMonths));
      subscriber.status = 'active';
      
      await subscriber.save();
      
      // Unblock network access
      if (subscriber.ipAddress) {
        await unblockClient(subscriber.ipAddress, subscriber.subscriberId);
      }
    }
    
    res.status(201).json({
      billing,
      message: 'Payment processed successfully'
    });
  } catch (error) {
    console.error('Error creating payment record:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Initiate M-Pesa payment - Public access
router.post('/mpesa/initiate', async (req, res) => {
  try {
    const { subscriberId, phoneNumber } = req.body;
    
    // Find subscriber
    const subscriber = await Subscriber.findOne({ subscriberId });
    if (!subscriber) return res.status(404).json({ message: 'Subscriber not found' });
    
    // Find the associated service plan
    const servicePlan = await ServicePlan.findById(subscriber.servicePlan);
    if (!servicePlan) {
      return res.status(400).json({ message: 'No service plan associated with this subscriber' });
    }
    
    // Integrate with the M-Pesa API
    const mpesaResponse = await initiateSTKPush({
      businessShortCode: process.env.MPESA_SHORTCODE,
      amount: servicePlan.price,
      phoneNumber,
      callbackUrl: `${process.env.API_URL}/api/billing/mpesa/callback`,
      accountReference: subscriberId,
      transactionDesc: `Payment for ${servicePlan.planName} subscription`
    });
    
    // Store the checkout request ID for verification in the callback
    pendingCheckouts.set(mpesaResponse.CheckoutRequestID, subscriber._id);
    
    res.json({
      message: 'M-Pesa payment initiated',
      checkoutRequestId: mpesaResponse.CheckoutRequestID,
      amount: servicePlan.price,
      phoneNumber
    });
  } catch (error) {
    console.error('Error initiating M-Pesa payment:', error);
    res.status(500).json({ message: 'Payment initiation failed' });
  }
});

// M-Pesa callback URL - Called by M-Pesa servers
router.post('/mpesa/callback', async (req, res) => {
  try {
    const { Body } = req.body;
    
    // Check if the transaction was successful
    if (Body.stkCallback.ResultCode === 0) {
      const checkoutRequestId = Body.stkCallback.CheckoutRequestID;
      
      // Retrieve the stored request data (subscriber ID, etc.)
      const subscriberId = pendingCheckouts.get(checkoutRequestId);
      if (!subscriberId) {
        return res.status(400).json({ message: 'Invalid checkout request ID' });
      }
      
      // Create a successful billing record
      const billing = new Billing({
        subscriber: subscriberId,
        amount: Body.stkCallback.CallbackMetadata.Item.find(item => item.Name === 'Amount').Value,
        paymentDate: new Date(),
        paymentMethod: 'mpesa',
        transactionId: Body.stkCallback.CallbackMetadata.Item.find(item => item.Name === 'MpesaReceiptNumber').Value,
        status: 'paid'
      });
      
      await billing.save();
      
      // Update subscriber status
      const subscriber = await Subscriber.findById(subscriberId);
      if (subscriber.status !== 'active') {
        const servicePlan = await ServicePlan.findById(subscriber.servicePlan);
        if (!servicePlan) {
          return res.status(400).json({ message: 'Subscriber has no associated service plan' });
        }
        
        const now = new Date();
        subscriber.subscriptionStartDate = now;
        subscriber.subscriptionEndDate = new Date(now.setMonth(now.getMonth() + servicePlan.durationInMonths));
        subscriber.status = 'active';
        
        await subscriber.save();
        
        // Unblock network access
        if (subscriber.ipAddress) {
          await unblockClient(subscriber.ipAddress, subscriber.subscriberId);
        }
      }
      
      // Remove the checkout request from the pending list
      pendingCheckouts.delete(checkoutRequestId);
    }
    
    // Acknowledge the callback
    res.json({ ResultCode: 0, ResultDesc: 'Acknowledged' });
  } catch (error) {
    console.error('Error processing M-Pesa callback:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Server error' });
  }
});

// Verify payment status - Public access
router.get('/verify/:transactionId', async (req, res) => {
  try {
    const billing = await Billing.findOne({ transactionId: req.params.transactionId })
      .populate('subscriber');
      
    if (!billing) return res.status(404).json({ message: 'Payment not found' });
    
    res.json({
      status: billing.status,
      amount: billing.amount,
      date: billing.paymentDate,
      subscriber: billing.subscriber.subscriberId
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;