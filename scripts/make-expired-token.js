const path = require('path');
const { createRequire } = require('module');

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

const now = Math.floor(Date.now() / 1000);
const token = jwt.sign(
  { id: 'expired-demo-user', email: 'expired@aupp.edu.kh', role: 'user', iat: now - 2 * 3600, exp: now - 3600 },
  process.env.JWT_SECRET
);
console.log(token);
