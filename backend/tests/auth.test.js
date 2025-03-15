// tests/auth.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../server'); // Adjust to match your app export

let mongoServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    
    // Create test admin user
    const Admin = require('../models/Admin');
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('testpassword', 10);
    await Admin.create({
        username: 'testadmin',
        password: hashedPassword
    });
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

describe('Authentication API', () => {
    test('Login with valid credentials should return token', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'testadmin',
                password: 'testpassword'
            });
        
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('token');
    });
    
    test('Login with invalid credentials should return 401', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'testadmin',
                password: 'wrongpassword'
            });
        
        expect(res.statusCode).toBe(401);
    });

    test('Login with non-existent user should return 401', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'nonexistentuser',
                password: 'anypassword'
            });
        
        expect(res.statusCode).toBe(401);
        expect(res.body).toHaveProperty('message', 'Invalid credentials');
    });

    test('Login with missing username should return error', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                password: 'testpassword'
            });
        
        expect(res.statusCode).toBe(401);
    });

    test('Login with missing password should return error', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'testadmin'
            });
        
        expect(res.statusCode).toBe(401);
    });

    test('Login with empty request body should return error', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({});
        
        expect(res.statusCode).toBe(401);
    });

    test('Token should contain admin id and role', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'testadmin',
                password: 'testpassword'
            });
        
        expect(res.statusCode).toBe(200);
        
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
        
        expect(decoded).toHaveProperty('id');
        expect(decoded).toHaveProperty('role');
    });
});

describe('Authentication API', () => {
  test('Login with valid credentials should return token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testadmin',
        password: 'testpassword'
      });
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('token');
  });
  
  test('Login with invalid credentials should return 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'testadmin',
        password: 'wrongpassword'
      });
    
    expect(res.statusCode).toBe(401);
  });
});