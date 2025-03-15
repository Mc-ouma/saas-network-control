const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');
const dotenv = require('dotenv');
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

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Import route modules
const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const paymentRoutes = require('./routes/payments');
const subscriberRoutes = require('./routes/subscribers');
const servicePlanRoutes = require('./routes/servicePlans');
const billingRoutes = require('./routes/billing');
const networkDeviceRoutes = require('./routes/networkDevices');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/subscribers', subscriberRoutes);
app.use('/api/service-plans', servicePlanRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/network-devices', networkDeviceRoutes);

app.get('/', (req, res) => {
  res.send('Hello from backend');
});

// Cron Job (every hour) to update network access
cron.schedule('0 * * * *', async () => {
  console.log('Checking subscriptions...');
  const Client = require('./models/Client');
  const clients = await Client.find();
  for (const client of clients) {
    await setNetworkAccess(client);
  }
  
  // Also check subscribers
  const Subscriber = require('./models/Subscriber');
  const subscribers = await Subscriber.find();
  for (const subscriber of subscribers) {
    // Update subscriber status based on subscription dates
    const now = new Date();
    if (subscriber.subscriptionEndDate < now) {
      subscriber.status = 'inactive';
      await subscriber.save();
      
      // Block network access if needed
      if (subscriber.ipAddress) {
        const { blockClient } = require('./utils/networkControl');
        await blockClient(subscriber.ipAddress, subscriber.subscriberId);
      }
    }
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));