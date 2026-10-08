const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

const SALT_ROUNDS = 10;

async function createAccount(req, res, role) {
  const { name, email, password, phone } = req.body ?? {};

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ message: 'password must be at least 6 characters' });
  }
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ name, email, password: hash, role, phone });

  res.status(201).json({ message: role === 'admin' ? 'Admin registered' : 'User registered', user });
}

router.post('/register/userregister', async (req, res) => {
  const { role } = req.body ?? {};
  if (role === 'admin') {
    return res.status(403).json({ message: 'Admins can only be created by an admin' });
  }
  if (role !== undefined && role !== 'user') {
    return res.status(400).json({ message: 'role must be "user" (or left out)' });
  }
  return createAccount(req, res, 'user');
});

router.post('/register/admin', (req, res) => createAccount(req, res, 'admin'));

module.exports = router;
