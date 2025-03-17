const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const NetworkDevice = require('../models/NetworkDevice');
const Subscriber = require('../models/Subscriber');
const app = require('../server');
const networkControl = require('../utils/networkControl');

// Pseudocode:
// - Set up JWT admin token for authorization.
// - Clear NetworkDevice and Subscriber collections before each test.
// - Test GET /api/network-devices when no devices exist.
// - Test POST /api/network-devices to create a device.
// - Test GET /api/network-devices/:id to retrieve a device.
// - Test PUT /api/network-devices/:id to update a device.
// - Test DELETE /api/network-devices/:id to remove a device.
// - For GET /api/network-devices/:id/status, mock executeSSHCommand to simulate ping.
// - For POST /api/network-devices/:id/assign, create a Subscriber and assign it.
// - Use jest and supertest. 

// Code to append to backend/tests/networkDevices.test.js:

process.env.JWT_SECRET = process.env.JWT_SECRET || 'testsecret';
const adminToken = jwt.sign({ id: 'admin123', role: 'admin' }, process.env.JWT_SECRET);

// Clear collections before each test
beforeEach(async () => {
    await NetworkDevice.deleteMany({});
    await Subscriber.deleteMany({});
});

afterAll(async () => {
    await mongoose.connection.close();
});

describe('NetworkDevices API', () => {
    test('GET /api/network-devices should return empty array', async () => {
        const res = await request(app)
            .get('/api/network-devices')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    });

    test('POST /api/network-devices should create a new device', async () => {
        const deviceData = { 
            deviceId: 'dev001', 
            deviceName: 'Router', 
            ipAddress: '192.168.1.10', 
            location: 'Office',
            status: 'offline'
        };
        
        const res = await request(app)
            .post('/api/network-devices')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(deviceData);
            
        expect(res.statusCode).toBe(201);
        expect(res.body).toHaveProperty('_id');
        expect(res.body.deviceId).toBe(deviceData.deviceId);
    });

    test('GET /api/network-devices/:id should return the created device', async () => {
        const device = await NetworkDevice.create({
            deviceId: 'dev002',
            deviceName: 'Switch',
            ipAddress: '192.168.1.20',
            location: 'Lab',
            status: 'offline'
        });
        
        const res = await request(app)
            .get(`/api/network-devices/${device._id}`)
            .set('Authorization', `Bearer ${adminToken}`);
            
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('_id', device.id);
        expect(res.body.deviceId).toBe('dev002');
    });

    test('PUT /api/network-devices/:id should update the device', async () => {
        const device = await NetworkDevice.create({
            deviceId: 'dev003',
            deviceName: 'Access Point',
            ipAddress: '192.168.1.30',
            location: 'Conference Room',
            status: 'offline'
        });
        
        const updateData = { deviceName: 'AP-Updated', ipAddress: '192.168.1.31' };
        
        const res = await request(app)
            .put(`/api/network-devices/${device._id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send(updateData);
            
        expect(res.statusCode).toBe(200);
        expect(res.body.deviceName).toBe('AP-Updated');
        expect(res.body.ipAddress).toBe('192.168.1.31');
    });

    test('DELETE /api/network-devices/:id should delete the device', async () => {
        const device = await NetworkDevice.create({
            deviceId: 'dev004',
            deviceName: 'Firewall',
            ipAddress: '192.168.1.40',
            location: 'Data Center',
            status: 'offline'
        });
        
        const delRes = await request(app)
            .delete(`/api/network-devices/${device._id}`)
            .set('Authorization', `Bearer ${adminToken}`);
            
        expect(delRes.statusCode).toBe(200);
        expect(delRes.body).toHaveProperty('message', 'Network device deleted');
        
        const getRes = await request(app)
            .get(`/api/network-devices/${device._id}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(getRes.statusCode).toBe(404);
    });

    test('GET /api/network-devices/:id/status should return device status', async () => {
        // Create a device
        const device = await NetworkDevice.create({
            deviceId: 'dev005',
            deviceName: 'Server',
            ipAddress: '192.168.1.50',
            location: 'Server Room',
            status: 'offline'
        });
        
        // Mock executeSSHCommand to simulate a successful ping
        const spy = jest.spyOn(networkControl, 'executeSSHCommand')
            .mockResolvedValue({ code: 0, output: 'ping successful' });
        
        const res = await request(app)
            .get(`/api/network-devices/${device._id}/status`)
            .set('Authorization', `Bearer ${adminToken}`);
            
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('status', 'online');
        expect(res.body).toHaveProperty('pingOutput', 'ping successful');
        
        spy.mockRestore();
    });

    test('POST /api/network-devices/:id/assign should assign a subscriber to the device', async () => {
        // Create a device
        const device = await NetworkDevice.create({
            deviceId: 'dev006',
            deviceName: 'Modem',
            ipAddress: '192.168.1.60',
            location: 'Reception',
            status: 'offline'
        });
        
        // Create a subscriber
        await Subscriber.create({
            subscriberId: 'sub001',
            name: 'John Doe',
            email: 'john@example.com',
            phone: '+1234567890',
            address: '123 Main St',
            servicePlan: null,
            subscriptionStartDate: new Date(),
            subscriptionEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'active'
        });
        
        const assignRes = await request(app)
            .post(`/api/network-devices/${device._id}/assign`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ subscriberId: 'sub001' });
            
        expect(assignRes.statusCode).toBe(200);
        expect(assignRes.body).toHaveProperty('message', 'Subscriber assigned to device successfully');
        expect(assignRes.body.device).toHaveProperty('assignedSubscriber');
    });
});