const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// One answer for every kind of wrong login, so nobody can find out which emails exist
const LOGIN_FAILED = 'Invalid email, password or role';

// A real bcrypt hash of a throwaway string. When no account matches, the password is still
// checked against it, so a wrong email takes as long as a wrong password and the response
// time doesn't give away which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// POST /auth/login (public): check email + password + role, then hand out a JWT
router.post('/auth/login', async (req, res) => {
  const { email, password, role } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || typeof role !== 'string') {
    return res.status(400).json({ message: 'email, password and role are required' });
  }

  // The password hash is left out of queries by default (select: false), so ask for it here
  const user = await User.findOne({ email: email.trim().toLowerCase(), role }).select('+password');
  const passwordOk = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !passwordOk) {
    return res.status(401).json({ message: LOGIN_FAILED });
  }

  // The token says who the user is. The gateway checks it on every request and turns it into
  // the x-user-id, x-user-role and x-user-email headers the services read.
  const token = jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  // toJSON in the model removes the password hash from "user"
  res.json({ message: 'Login successful', token, user });
});

module.exports = router;
