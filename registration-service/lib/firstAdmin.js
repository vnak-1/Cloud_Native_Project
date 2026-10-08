const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function ensureFirstAdmin(label) {
  if (await User.exists({ role: 'admin' })) {
    return;
  }

  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn(`[${label}] No admin exists yet. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env and restart.`);
    return;
  }

  try {
    await User.create({
      name: 'Admin',
      email: ADMIN_EMAIL,
      password: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: 'admin',
    });
    console.log(`[${label}] Created the first admin: ${ADMIN_EMAIL}`);
  } catch (err) {
    console.error(`[${label}] Could not create the first admin (${ADMIN_EMAIL}): ${err.message}`);
  }
}

module.exports = { ensureFirstAdmin };
