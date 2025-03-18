const request = require('supertest');
const app = require('../server');
const ServicePlan = require('../models/ServicePlan');
const Subscriber = require('../models/Subscriber');
const { setupDB, teardownDB, getAdminToken, clearDatabase } = require('./setup');

beforeAll(setupDB);
afterAll(teardownDB);
beforeEach(clearDatabase);

describe('ServicePlans API', () => {
  test('GET / should return all service plans', async () => {
    // Create test plans
    await ServicePlan.create([
      {
        planName: 'Basic Plan',
        price: 19.99,
        durationInMonths: 1,
        features: ['Feature 1', 'Feature 2'],
        isActive: true
      },
      {
        planName: 'Premium Plan',
        price: 49.99,
        durationInMonths: 3,
        features: ['Premium Feature 1', 'Premium Feature 2'],
        isActive: true
      }
    ]);

    const res = await request(app).get('/api/service-plans');
    
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0]).toHaveProperty('planName');
    expect(res.body[1]).toHaveProperty('price');
  });

  test('GET / with active=true should return only active plans', async () => {
    // Create both active and inactive plans
    await ServicePlan.create([
      {
        planName: 'Active Plan',
        price: 29.99,
        durationInMonths: 2,
        isActive: true
      },
      {
        planName: 'Inactive Plan',
        price: 39.99,
        durationInMonths: 2,
        isActive: false
      }
    ]);

    const res = await request(app).get('/api/service-plans?active=true');
    
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].planName).toBe('Active Plan');
  });

  test('POST / should create a new service plan', async () => {
    const planData = {
      planName: 'New Plan',
      price: 19.99,
      durationInMonths: 1,
      features: ['Feature 1', 'Feature 2']
    };

    const res = await request(app)
      .post('/api/service-plans')
      .set('Authorization', `Bearer ${getAdminToken()}`)
      .send(planData);

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('planName', 'New Plan');
    expect(res.body).toHaveProperty('price', 19.99);
    expect(res.body).toHaveProperty('isActive', true);
  });

  test('POST / should reject duplicate plan names', async () => {
    // Create a plan first
    await ServicePlan.create({
      planName: 'Existing Plan',
      price: 29.99,
      durationInMonths: 2
    });

    // Try to create another with the same name
    const planData = {
      planName: 'Existing Plan',
      price: 19.99,
      durationInMonths: 1
    };

    const res = await request(app)
      .post('/api/service-plans')
      .set('Authorization', `Bearer ${getAdminToken()}`)
      .send(planData);

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('message', 'A service plan with this name already exists');
  });

  test('GET /:id should return a specific service plan', async () => {
    const plan = await ServicePlan.create({
      planName: 'Premium Plan',
      price: 49.99,
      durationInMonths: 3,
      features: ['Premium Feature 1', 'Premium Feature 2'],
      isActive: true
    });

    const res = await request(app).get(`/api/service-plans/${plan._id}`);
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('planName', 'Premium Plan');
    expect(res.body).toHaveProperty('subscriberCount', 0);
  });

  test('GET /:id should return 404 for non-existent plan', async () => {
    const res = await request(app).get(`/api/service-plans/5f7d5f3e8b5fce001c8d1234`);
    
    expect(res.statusCode).toBe(404);
    expect(res.body).toHaveProperty('message', 'Service plan not found');
  });

  test('PUT /:id should update a service plan', async () => {
    const plan = await ServicePlan.create({
      planName: 'Standard Plan',
      price: 29.99,
      durationInMonths: 2,
      features: ['Standard Feature 1', 'Standard Feature 2'],
      isActive: true
    });

    const updateData = {
      planName: 'Standard Plan Updated',
      price: 34.99,
      features: ['Updated Feature 1', 'Updated Feature 2']
    };

    const res = await request(app)
      .put(`/api/service-plans/${plan._id}`)
      .set('Authorization', `Bearer ${getAdminToken()}`)
      .send(updateData);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('planName', 'Standard Plan Updated');
    expect(res.body).toHaveProperty('price', 34.99);
    expect(res.body.features).toContain('Updated Feature 1');
  });

  test('DELETE /:id should delete a service plan', async () => {
    const plan = await ServicePlan.create({
      planName: 'Temporary Plan',
      price: 9.99,
      durationInMonths: 1,
      isActive: true
    });

    const res = await request(app)
      .delete(`/api/service-plans/${plan._id}`)
      .set('Authorization', `Bearer ${getAdminToken()}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message', 'Service plan deleted successfully');

    const findPlan = await ServicePlan.findById(plan._id);
    expect(findPlan).toBeNull();
  });

  test('DELETE /:id should not delete a plan assigned to subscribers', async () => {
    const plan = await ServicePlan.create({
      planName: 'Used Plan',
      price: 29.99,
      durationInMonths: 2,
      isActive: true
    });

    await Subscriber.create({
      subscriberId: 'SUB123',
      name: 'Test Subscriber',
      email: 'test@example.com',
      servicePlan: plan._id,
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    const res = await request(app)
      .delete(`/api/service-plans/${plan._id}`)
      .set('Authorization', `Bearer ${getAdminToken()}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/cannot delete/i);
  });

  test('PUT /:id/deactivate should deactivate a service plan', async () => {
    const plan = await ServicePlan.create({
      planName: 'To Deactivate Plan',
      price: 39.99,
      durationInMonths: 3,
      isActive: true
    });

    const res = await request(app)
      .put(`/api/service-plans/${plan._id}/deactivate`)
      .set('Authorization', `Bearer ${getAdminToken()}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message', 'Service plan deactivated successfully');
    expect(res.body.servicePlan).toHaveProperty('isActive', false);
  });
});