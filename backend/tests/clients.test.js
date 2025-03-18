const request = require('supertest');
const app = require('../server');
const Client = require('../models/Client');
const { setupDB, teardownDB, getAdminToken, clearDatabase } = require('./setup');

beforeAll(setupDB);
afterAll(teardownDB);
beforeEach(clearDatabase);

describe('Clients API', () => {
  test('GET / should return empty array initially', async () => {
    const res = await request(app)
      .get('/api/clients')
      .set('Authorization', `Bearer ${getAdminToken()}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });
  
  test('POST / should create a new client', async () => {
    const clientData = {
      clientId: 'CLIENT001',
      name: 'Test Client',
      email: 'client@example.com',
      ipAddress: '192.168.1.100',
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };
    
    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${getAdminToken()}`)
      .send(clientData);
      
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('clientId', 'CLIENT001');
    expect(res.body).toHaveProperty('name', 'Test Client');
  });
  
  test('PUT /:id should update a client', async () => {
    const client = await Client.create({
      clientId: 'CLIENT002',
      name: 'Original Name',
      email: 'original@example.com',
      ipAddress: '192.168.1.101',
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    
    const updateData = {
      name: 'Updated Name',
      email: 'updated@example.com'
    };
    
    const res = await request(app)
      .put(`/api/clients/${client._id}`)
      .set('Authorization', `Bearer ${getAdminToken()}`)
      .send(updateData);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('name', 'Updated Name');
    expect(res.body).toHaveProperty('email', 'updated@example.com');
  });
  
  test('DELETE /:id should delete a client', async () => {
    const client = await Client.create({
      clientId: 'CLIENT003',
      name: 'To Delete',
      email: 'delete@example.com',
      ipAddress: '192.168.1.102',
      subscriptionStartDate: new Date(),
      subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    
    const res = await request(app)
      .delete(`/api/clients/${client._id}`)
      .set('Authorization', `Bearer ${getAdminToken()}`);
      
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('message', 'Client deleted');
    
    const findClient = await Client.findById(client._id);
    expect(findClient).toBeNull();
  });
});