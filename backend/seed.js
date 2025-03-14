const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('./models/Admin');
require('dotenv').config();

async function seedAdmin() {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const username = 'admin';
  const password = 'password123';
  const hashedPassword = await bcrypt.hash(password, 10);
  await Admin.create({ username, password: hashedPassword });
  console.log('Admin user created');
  mongoose.disconnect();
}

seedAdmin();