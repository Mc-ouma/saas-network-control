const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const auth = require('./middleware/auth');
const Client = require('./models/Client');
const Admin = require('./models/Admin');
const { setNetworkAccess } = require('./utils/networkControl');

dotenv.config();

// Create Express server
const app = express();

// Middleware
app.use(cors({
  origin: 'http://localhost:3000', // allow only the React app to connect
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));


// Login Route
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const admin = await Admin.findOne({ username });
  if (!admin) return res.status(401).json({ message: 'Invalid credentials' });
  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
  const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

// Client Routes
app.get('/api/clients', auth, async (req, res) => {
  const clients = await Client.find();
  res.json(clients);
});

app.get('/', (req, res) => {
  res.send('Hello from backend');
});

app.post('/api/clients', auth, async (req, res) => {
  const client = new Client(req.body);
  await client.save();
  await setNetworkAccess(client);
  res.status(201).json(client);
});

app.put('/api/clients/:id', auth, async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ message: 'Client not found' });
  Object.assign(client, req.body);
  await client.save();
  await setNetworkAccess(client);
  res.json(client);
});

app.delete('/api/clients/:id', auth, async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) return res.status(404).json({ message: 'Client not found' });
  await setNetworkAccess({ ...client, subscriptionEndDate: new Date(0) });
  await client.remove();
  res.json({ message: 'Client deleted' });
});

// Cron Job (every hour)
cron.schedule('0 * * * *', async () => {
  console.log('Checking subscriptions...');
  const clients = await Client.find();
  for (const client of clients) {
    await setNetworkAccess(client);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));