const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

const LOGIN_FAILED = 'Invalid email, password or role';

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

router.post('/auth/login', async (req, res) => {
  const { email, password, role } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || typeof role !== 'string') {
    return res.status(400).json({ message: 'email, password and role are required' });
  }

  const user = await User.findOne({ email: email.trim().toLowerCase(), role }).select('+password');
  const passwordOk = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !passwordOk) {
    return res.status(401).json({ message: LOGIN_FAILED });
  }

  const token = jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  res.json({ message: 'Login successful', token, user });
});

module.exports = router;
