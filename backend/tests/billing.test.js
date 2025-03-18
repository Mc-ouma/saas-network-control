const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const request = require('supertest');
const app = require('../server');
const Billing = require('../models/Billing');
const Subscriber = require('../models/Subscriber');
const ServicePlan = require('../models/ServicePlan');

let mongoServer;

// Mock dependencies
jest.mock('../utils/networkControl', () => ({
  blockClient: jest.fn().mockResolvedValue(true),
  unblockClient: jest.fn().mockResolvedValue(true),
  executeSSHCommand: jest.fn().mockResolvedValue({ code: 0, output: 'success' })
}));

jest.mock('../utils/email', () => ({
  sendExpirationWarning: jest.fn().mockResolvedValue(true)
}));

jest.mock('../utils/mpesa', () => ({
  initiateSTKPush: jest.fn().mockResolvedValue({ 
    CheckoutRequestID: 'test-checkout-id'
  }),
  checkTransactionStatus: jest.fn().mockResolvedValue({
    ResultCode: 0,
    ResultDesc: 'Success'
  })
}));

// Setup function to be called in beforeAll
const setupDB = async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Create admin user for auth tests
  const hashedPassword = await bcrypt.hash('testpassword', 10);
  await Admin.create({
    username: 'testadmin',
    password: hashedPassword,
    role: 'admin'
  });
  
  process.env.JWT_SECRET = 'test-jwt-secret';
};

// Teardown function to be called in afterAll
const teardownDB = async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
};

// Generate admin token for protected routes
const getAdminToken = () => {
  return jwt.sign({ id: 'test-admin-id', role: 'admin' }, process.env.JWT_SECRET);
};

// Clear all collections between tests
const clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};

beforeAll(setupDB);
afterAll(teardownDB);
beforeEach(clearDatabase);

describe('Billing API', () => {
  let subscriber, servicePlan;
  
  beforeEach(async () => {
    servicePlan = await ServicePlan.create({
      planName: 'Test Plan',
      price: 29.99,
      durationInMonths: 1
    });
    
    subscriber = await Subscriber.create({
      subscriberId: 'SUB001',
      name: 'John Doe',
      email: 'john@example.com',
      servicePlan: servicePlan._id,
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
  });
  
  test('GET / should return billing records with pagination', async () => {
    const res = await request(app)
      .get('/api/billing')
      .set('Authorization', `Bearer ${getAdminToken()}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('billingRecords');
    expect(res.body).toHaveProperty('totalPages');
    expect(res.body).toHaveProperty('currentPage');
  });
  
  test('POST / should create a new billing record', async () => {
    const paymentData = {
      subscriberId: 'SUB001',
      amount: 29.99,
      paymentMethod: 'credit_card',
      transactionId: 'txn_123456'
    };
    
    const res = await request(app)
      .post('/api/billing')
      .set('Authorization', `Bearer ${getAdminToken()}`)
      .send(paymentData);
      
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('billing');
    expect(res.body.billing).toHaveProperty('amount', 29.99);
    expect(res.body.billing).toHaveProperty('paymentMethod', 'credit_card');
    expect(res.body).toHaveProperty('message', 'Payment processed successfully');
  });
  
  test('POST / should reject invalid payment method', async () => {
    const paymentData = {
      subscriberId: 'SUB001',
      amount: 29.99,
      paymentMethod: 'invalid_method',
      transactionId: 'txn_123456'
    };
    
    const res = await request(app)
      .post('/api/billing')
      .set('Authorization', `Bearer ${getAdminToken()}`)
      .send(paymentData);
      
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message', 'Invalid payment method');
  });
  
  test('GET /:id should return a specific billing record', async () => {
    const billing = await Billing.create({
      subscriber: subscriber._id,
      amount: 29.99,
      paymentDate: new Date(),
      paymentMethod: 'credit_card',
      transactionId: 'txn_123457',
      status: 'paid'
    });
    
    const res = await request(app)
      .get(`/api/billing/${billing._id}`)
      .set('Authorization', `Bearer ${getAdminToken()}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('amount', 29.99);
    expect(res.body).toHaveProperty('transactionId', 'txn_123457');
  });
  
  test('GET /subscriber/:subscriberId should return billing history for a subscriber', async () => {
    await Billing.create({
      subscriber: subscriber._id,
      amount: 29.99,
      paymentDate: new Date(),
      paymentMethod: 'credit_card',
      transactionId: 'txn_123458',
      status: 'paid'
    });
    
    const res = await request(app)
      .get(`/api/billing/subscriber/${subscriber.subscriberId}`)
      .set('Authorization', `Bearer ${getAdminToken()}`);
      
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0]).toHaveProperty('transactionId', 'txn_123458');
  });
  
  test('POST /mpesa/initiate should start M-Pesa payment process', async () => {
    const mpesaData = {
      subscriberId: 'SUB001',
      phoneNumber: '+254712345678'
    };
    
    const res = await request(app)
      .post('/api/billing/mpesa/initiate')
      .send(mpesaData);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message', 'M-Pesa payment initiated');
    expect(res.body).toHaveProperty('checkoutRequestId', 'test-checkout-id');
  });
  
  test('GET /verify/:transactionId should verify payment status', async () => {
    const billing = await Billing.create({
      subscriber: subscriber._id,
      amount: 29.99,
      paymentDate: new Date(),
      paymentMethod: 'mpesa',
      transactionId: 'MPESA123459',
      status: 'paid'
    });
    
    const res = await request(app).get('/api/billing/verify/MPESA123459');
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'paid');
    expect(res.body).toHaveProperty('amount', 29.99);
    expect(res.body).toHaveProperty('subscriber', 'SUB001');
  });
});

module.exports = {
  setupDB,
  teardownDB,
  getAdminToken,
  clearDatabase
};