const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

// bcrypt's "cost": how much work one hash takes. 10 is the usual default.
const SALT_ROUNDS = 10;

// Creates an account with the given role. The password is hashed before it's saved.
async function createAccount(req, res, role) {
  const { name, email, password, phone } = req.body ?? {};

  // Checked here because the schema only ever sees the hash, never the real password
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ message: 'password must be at least 6 characters' });
  }
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.create({ name, email, password: hash, role, phone });

  // toJSON in the model removes the password hash from the response
  res.status(201).json({ message: role === 'admin' ? 'Admin registered' : 'User registered', user });
}

// POST /register/userregister (public): students sign up here. It only creates users,
// so nobody can make themselves an admin.
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

// POST /register/admin: creates an admin. The gateway's route table only lets admins call it.
router.post('/register/admin', (req, res) => createAccount(req, res, 'admin'));

module.exports = router;
