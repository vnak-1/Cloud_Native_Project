const path = require('path');
const os = require('os');

// Load .env (next to this file) into process.env, like python-dotenv. In Docker there is
// no .env file in the image; compose passes the variables in instead.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const routeTable = require('./routeTable');
const authorize = require('./middleware/authorize');
const requestLogger = require('./middleware/requestLogger');
const forwardTo = require('./lib/forward');

// Refuse to start without the settings we need, instead of failing later in odd ways
const required = [
  'PORT',
  'SERVICE_NAME',
  'JWT_SECRET',
  'INTERNAL_KEY',
  'REGISTRATION_URL',
  'LOGIN_URL',
  'EQUIPMENT_URL',
  'LOAN_URL',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Add them to .env (README.md lists them).`);
  process.exit(1);
}
const { PORT, SERVICE_NAME } = process.env;

// The services behind the gateway. The URLs come from the environment, so the same image
// works locally (Docker service names) and on EC2 (the other instances' private IPs).
const services = {
  registration: { label: 'Registration', url: process.env.REGISTRATION_URL },
  login: { label: 'Login', url: process.env.LOGIN_URL },
  equipment: { label: 'Equipment', url: process.env.EQUIPMENT_URL },
  loan: { label: 'Loan', url: process.env.LOAN_URL },
};
for (const service of Object.values(services)) {
  service.url = service.url.replace(/\/+$/, ''); // drop a trailing slash
}

const app = express();

// Middleware runs in the order it's added, for every request, before the routes.
app.use(requestLogger(SERVICE_NAME));

// Turn JSON request bodies into req.body
app.use(express.json());

// Health check for Docker: no token needed
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, instance: os.hostname() });
});

// One Express route per row of the route table, for example
//   app.post('/equipment', authorize(['admin']), forwardTo(services.equipment))
// Express matches the method and the path (":id" matches any value), then runs the two
// middleware functions in order: check the token and role, then forward the request.
for (const route of routeTable) {
  app[route.method.toLowerCase()](route.path, authorize(route.roles), forwardTo(services[route.service]));
}

// Anything that isn't in the route table (deny by default), including every /internal/* path
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler. Express knows it's one because it has 4 parameters (err, req, res, next).
app.use((err, req, res, next) => {
  // The body isn't valid JSON (thrown by express.json())
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body must be valid JSON' });
  }
  console.error(`[${SERVICE_NAME}]`, err);
  res.status(500).json({ message: 'Internal server error' });
});

const server = app.listen(PORT, (err) => {
  if (err) {
    console.error(`[${SERVICE_NAME}] Can't listen on port ${PORT}: ${err.message}`);
    process.exit(1);
  }
  console.log(`[${SERVICE_NAME}] listening on port ${PORT}`);
});

// Graceful shutdown. Docker sends SIGTERM when it stops a container; Ctrl+C sends SIGINT.
// Stop taking new requests and let the current ones finish. (The gateway has no database.)
const shutdown = (signal) => {
  console.log(`[${SERVICE_NAME}] ${signal} received, shutting down`);
  server.close(() => {
    console.log(`[${SERVICE_NAME}] HTTP server closed`);
    process.exit(0);
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
