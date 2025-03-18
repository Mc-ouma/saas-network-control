// tests/auth.test.js
const request = require('supertest');
const app = require('../server');
const { setupDB, teardownDB } = require('./setup');

beforeAll(setupDB);
afterAll(teardownDB);

describe('Auth API', () => {
  test('POST /api/auth/login with valid credentials should return token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testadmin',
        password: 'testpassword'
      });
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  test('POST /api/auth/login with invalid credentials should return 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testadmin',
        password: 'wrongpassword'
      });
    
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('message', 'Invalid credentials');
  });

  test('POST /api/auth/login with non-existent user should return 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'nonexistentuser',
        password: 'anypassword'
      });
    
    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('message', 'Invalid credentials');
  });

  test('POST /api/auth/login with missing username should return 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        password: 'testpassword'
      });
    
    expect(res.statusCode).toBe(401);
  });

  test('POST /api/auth/login with missing password should return 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testadmin'
      });
    
    expect(res.statusCode).toBe(401);
  });
});