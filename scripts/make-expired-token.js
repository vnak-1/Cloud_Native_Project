// Prints a JWT that expired an hour ago, for the "Expired token" test in Postman.
// It is signed with the gateway's real JWT_SECRET (read from gateway/.env with dotenv, never
// written here), so the gateway answers "Token expired" rather than "Invalid token".
//
// Run from the repo root:  node scripts/make-expired-token.js
// Then paste the output into the Postman environment variable "expiredToken".
const path = require('path');
const { createRequire } = require('module');

// Borrow dotenv and jsonwebtoken from the gateway's node_modules, so this script needs no
// packages of its own. (Run "npm install" in gateway/ first.)
const gatewayRequire = createRequire(path.join(__dirname, '..', 'gateway', 'package.json'));
let dotenv;
let jwt;
try {
  dotenv = gatewayRequire('dotenv');
  jwt = gatewayRequire('jsonwebtoken');
} catch {
  console.error('Run "npm install" in gateway/ first (this script uses its packages).');
  process.exit(1);
}

const envFile = path.join(__dirname, '..', 'gateway', '.env');
dotenv.config({ path: envFile });
if (!process.env.JWT_SECRET) {
  console.error(`No JWT_SECRET found in ${envFile}`);
  process.exit(1);
}

// Issued two hours ago, expired one hour ago
const now = Math.floor(Date.now() / 1000);
const token = jwt.sign(
  { id: 'expired-demo-user', email: 'expired@aupp.edu.kh', role: 'user', iat: now - 2 * 3600, exp: now - 3600 },
  process.env.JWT_SECRET
);
console.log(token);
