const request = require('supertest');
const app = require('../server');
const Subscriber = require('../models/Subscriber');
const ServicePlan = require('../models/ServicePlan');
const { setupDB, teardownDB, getAdminToken, clearDatabase } = require('./setup');
const { blockClient, unblockClient } = require('../utils/networkControl');

beforeAll(setupDB);
afterAll(teardownDB);
beforeEach(clearDatabase);

describe('Subscribers API', () => {
  let servicePlan;
  
  beforeEach(async () => {
    servicePlan = await ServicePlan.create({
      planName: 'Test Plan',
      price: 29.99,
      durationInMonths: 1
    });
  });
  
  test('GET / should return subscribers with pagination', async () => {
    // Create some test subscribers
    await Subscriber.insertMany([
      {
        subscriberId: 'SUB001',
        name: 'John Doe',
        email: 'john@example.com',
        servicePlan: servicePlan._id,
        subscriptionStartDate: new Date(),
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      {
        subscriberId: 'SUB002',
        name: 'Jane Smith',
        email: 'jane@example.com',
        servicePlan: servicePlan._id,
        subscriptionStartDate: new Date(),
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    ]);
    
    const res = await request(app)
      .get('/api/subscribers')
      .set('Authorization', `Bearer ${getAdminToken()}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('subscribers');
    expect(res.body.subscribers.length).toBe(2);
    expect(res.body).toHaveProperty('totalPages');
    expect(res.body).toHaveProperty('currentPage', 1);
  });
  
  test('POST / should create a new subscriber', async () => {
    const subscriberData = {
      subscriberId: 'SUB003',
      name: 'Alice Brown',
      email: 'alice@example.com',
      phone: '+1234567890',
      servicePlan: servicePlan._id,
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };
    
    const res = await request(app)
      .post('/api/subscribers')
      .set('Authorization', `Bearer ${getAdminToken()}`)
      .send(subscriberData);
      
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('subscriberId', 'SUB003');
    expect(res.body).toHaveProperty('name', 'Alice Brown');
  });
  
  test('POST / should validate required fields', async () => {
    const invalidData = {
      // Missing required fields
      name: 'Missing Fields',
      email: 'missing@example.com'
    };
    
    const res = await request(app)
      .post('/api/subscribers')
      .set('Authorization', `Bearer ${getAdminToken()}`)
      .send(invalidData);
      
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message');
  });
  
  test('GET /:id should return a specific subscriber', async () => {
    const subscriber = await Subscriber.create({
      subscriberId: 'SUB004',
      name: 'Bob Johnson',
      email: 'bob@example.com',
      servicePlan: servicePlan._id,
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    
    const res = await request(app)
      .get(`/api/subscribers/${subscriber._id}`)
      .set('Authorization', `Bearer ${getAdminToken()}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('subscriberId', 'SUB004');
    expect(res.body).toHaveProperty('name', 'Bob Johnson');
  });
  
  test('GET /lookup/:subscriberId should return subscriber info', async () => {
    await Subscriber.create({
      subscriberId: 'SUB005',
      name: 'Charlie Davis',
      email: 'charlie@example.com',
      servicePlan: servicePlan._id,
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    
    const res = await request(app)
      .get('/api/subscribers/lookup/SUB005');
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('subscriberId', 'SUB005');
    expect(res.body).toHaveProperty('name', 'Charlie Davis');
  });
  
  test('PUT /:id should update a subscriber', async () => {
    const subscriber = await Subscriber.create({
      subscriberId: 'SUB006',
      name: 'David Wilson',
      email: 'david@example.com',
      servicePlan: servicePlan._id,
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    
    const updateData = {
      name: 'David Miller',
      phone: '+9876543210'
    };
    
    const res = await request(app)
      .put(`/api/subscribers/${subscriber._id}`)
      .set('Authorization', `Bearer ${getAdminToken()}`)
      .send(updateData);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('name', 'David Miller');
    expect(res.body).toHaveProperty('phone', '+9876543210');
  });
  
  test('DELETE /:id should delete a subscriber', async () => {
    const subscriber = await Subscriber.create({
      subscriberId: 'SUB007',
      name: 'Emma Wilson',
      email: 'emma@example.com',
      servicePlan: servicePlan._id,
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    
    const res = await request(app)
      .delete(`/api/subscribers/${subscriber._id}`)
      .set('Authorization', `Bearer ${getAdminToken()}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message');
    
    const findSubscriber = await Subscriber.findById(subscriber._id);
    expect(findSubscriber).toBeNull();
  });
  
  test('GET /status/:subscriberId should return subscription status', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 15);
    
    await Subscriber.create({
      subscriberId: 'SUB008',
      name: 'Frank Miller',
      email: 'frank@example.com',
      servicePlan: servicePlan._id,
      status: 'active',
      subscriptionStartDate: new Date(),
      subscriptionEndDate: futureDate
    });
    
    const res = await request(app).get('/api/subscribers/status/SUB008');
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'active');
    expect(res.body).toHaveProperty('daysRemaining');
  });
});