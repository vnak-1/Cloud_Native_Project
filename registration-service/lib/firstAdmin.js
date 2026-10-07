const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Makes sure there's an admin to log in with. On startup, if no admin exists yet, it creates
// one from ADMIN_EMAIL and ADMIN_PASSWORD in .env. After that, admins can only be created by
// another admin, through POST /register/admin.
async function ensureFirstAdmin(label) {
  if (await User.exists({ role: 'admin' })) {
    return; // an admin already exists, so there's nothing to do
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
    // For example, ADMIN_EMAIL already belongs to a student account, or isn't a valid email
    console.error(`[${label}] Could not create the first admin (${ADMIN_EMAIL}): ${err.message}`);
  }
}

module.exports = { ensureFirstAdmin };
