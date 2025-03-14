const express = require('express');
const auth = require('../middleware/auth');
const Client = require('../models/Client');
const { blockClient, unblockClient } = require('../utils/networkControl');
const { sendExpirationWarning } = require('../utils/email');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  const clients = await Client.find();
  res.json(clients);
});

router.post('/', auth, async (req, res) => {
  const client = new Client(req.body);
  await client.save();
  if (new Date(client.subscriptionEndDate) > new Date()) {
    client.subscriptionStatus = 'active';
    await client.save();
  }
  res.status(201).json(client);
});

router.put('/:id', auth, async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ message: 'Client not found' });
  Object.assign(client, req.body);
  await client.save();
  const now = new Date();
  if (client.subscriptionEndDate < now) {
    await blockClient(client.ipAddress, client.clientId);
    client.subscriptionStatus = 'expired';
  } else {
    await unblockClient(client.ipAddress, client.clientId);
    client.subscriptionStatus = 'active';
  }
  await client.save();
  res.json(client);
});

router.delete('/:id', auth, async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ message: 'Client not found' });
  await unblockClient(client.ipAddress, client.clientId);
  await client.remove();
  res.json({ message: 'Client deleted' });
});

module.exports = router;