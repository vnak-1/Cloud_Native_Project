const path = require('path');
const os = require('os');

// Load .env (next to this file) into process.env, like python-dotenv. In Docker there is
// no .env file in the image; compose passes the variables in instead.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const { ensureFirstAdmin } = require('./lib/firstAdmin');
const internalOnly = require('./middleware/internalOnly');
const requestLogger = require('./middleware/requestLogger');
const registerRoutes = require('./routes/register');

// Refuse to start without the settings we need, instead of failing later in odd ways.
// (Without INTERNAL_KEY, the key check would compare undefined with undefined and let
// everyone in.) ADMIN_EMAIL and ADMIN_PASSWORD are optional: see lib/firstAdmin.js.
const required = ['PORT', 'SERVICE_NAME', 'MONGO_URI', 'INTERNAL_KEY'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}. See .env.example.`);
  process.exit(1);
}
const { PORT, SERVICE_NAME, MONGO_URI } = process.env;

const app = express();

// Middleware runs in the order it's added, for every request, before the routes.
app.use(requestLogger(SERVICE_NAME));

// Turn JSON request bodies into req.body
app.use(express.json());

// Health check for Docker: no internal key needed. 503 while the database is down.
// In Docker, os.hostname() is the container id, so you can tell containers apart.
app.get('/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1; // 1 means connected
  res
    .status(dbUp ? 200 : 503)
    .json({ status: dbUp ? 'ok' : 'error', service: SERVICE_NAME, instance: os.hostname() });
});

// Everything below needs the internal key (only the gateway has it)
app.use(internalOnly);
app.use(registerRoutes);

// No route matched
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler. Express knows it's one because it has 4 parameters (err, req, res, next).
// Express 5 also sends errors thrown in async routes here, so routes don't need try/catch.
app.use((err, req, res, next) => {
  // The body isn't valid JSON (thrown by express.json())
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body must be valid JSON' });
  }
  // A schema rule failed (required, match, enum, ...): list every problem
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) =>
      e.name === 'CastError' ? `${e.path} has an invalid value` : e.message
    );
    return res.status(400).json({ message: messages.join(', ') });
  }
  // Unique index violation (MongoDB error 11000): the email is already registered
  if (err.code === 11000) {
    return res.status(409).json({ message: 'An account with this email already exists' });
  }
  console.error(`[${SERVICE_NAME}]`, err);
  res.status(500).json({ message: 'Internal server error' });
});

// Connect to the database, make sure an admin exists, then start accepting requests
async function start() {
  await connectDB(MONGO_URI, SERVICE_NAME);
  await ensureFirstAdmin(SERVICE_NAME);

  const server = app.listen(PORT, (err) => {
    if (err) {
      console.error(`[${SERVICE_NAME}] Can't listen on port ${PORT}: ${err.message}`);
      process.exit(1);
    }
    console.log(`[${SERVICE_NAME}] listening on port ${PORT}`);
  });

  // Graceful shutdown. Docker sends SIGTERM when it stops a container; Ctrl+C sends SIGINT.
  // Stop taking new requests, let the current ones finish, then close the database.
  const shutdown = (signal) => {
    console.log(`[${SERVICE_NAME}] ${signal} received, shutting down`);
    server.close(async () => {
      await mongoose.connection.close();
      console.log(`[${SERVICE_NAME}] HTTP server and MongoDB connection closed`);
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error(`[${SERVICE_NAME}] Failed to start: ${err.message}`);
  process.exit(1);
});
