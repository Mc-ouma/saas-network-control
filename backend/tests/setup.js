const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

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
  const uri = mongoServer.getUri();
  
  // Only connect if not already connected
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

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

module.exports = {
  setupDB,
  teardownDB,
  getAdminToken,
  clearDatabase,
};