const path = require('path');

// Load .env (next to this file) into process.env, like python-dotenv. In Docker there is
// no .env file in the image; compose passes the variables in instead.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const internalOnly = require('./middleware/internalOnly');
const requestLogger = require('./middleware/requestLogger');
const equipmentRoutes = require('./routes/equipment');
const internalRoutes = require('./routes/internal');

// Refuse to start without the settings we need, instead of failing later in odd ways.
// (Without INTERNAL_KEY, the key check would compare undefined with undefined and let
// everyone in.)
const required = ['PORT', 'SERVICE_NAME', 'INSTANCE_ID', 'MONGO_URI', 'INTERNAL_KEY'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Add them to .env (README.md lists them).`);
  process.exit(1);
}
const { PORT, SERVICE_NAME, INSTANCE_ID, MONGO_URI } = process.env;

const app = express();

// Middleware runs in the order it's added, for every request, before the routes.
app.use(requestLogger(INSTANCE_ID));

// Put "instance" first in every JSON response, so Postman shows which replica answered.
// This swaps in our own res.json that adds the field and then calls the original one.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson({ instance: INSTANCE_ID, ...body });
  next();
});

// Turn JSON request bodies into req.body
app.use(express.json());

// Health check for Docker: no internal key needed. 503 while the database is down.
app.get('/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1; // 1 means connected
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'error', service: SERVICE_NAME });
});

// Everything below needs the internal key
app.use(internalOnly);
app.use(equipmentRoutes);
app.use(internalRoutes);

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
  // A schema rule failed (required, enum, min, ...): list every problem
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) =>
      e.name === 'CastError' ? `${e.path} has an invalid value` : e.message
    );
    return res.status(400).json({ message: messages.join(', ') });
  }
  // A value couldn't be converted to the right type, e.g. a malformed id
  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${err.path}` });
  }
  // Unique index violation (MongoDB error 11000), e.g. a name that already exists
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'value';
    return res.status(409).json({ message: `An item with this ${field} already exists` });
  }
  console.error(`[${INSTANCE_ID}]`, err);
  res.status(500).json({ message: 'Internal server error' });
});

// Connect to the database first, then start accepting requests
async function start() {
  await connectDB(MONGO_URI, INSTANCE_ID);

  const server = app.listen(PORT, (err) => {
    if (err) {
      console.error(`[${INSTANCE_ID}] Can't listen on port ${PORT}: ${err.message}`);
      process.exit(1);
    }
    console.log(`[${INSTANCE_ID}] ${SERVICE_NAME} listening on port ${PORT}`);
  });

  // Graceful shutdown. Docker sends SIGTERM when it stops a container; Ctrl+C sends SIGINT.
  // Stop taking new requests, let the current ones finish, then close the database.
  const shutdown = (signal) => {
    console.log(`[${INSTANCE_ID}] ${signal} received, shutting down`);
    server.close(async () => {
      await mongoose.connection.close();
      console.log(`[${INSTANCE_ID}] HTTP server and MongoDB connection closed`);
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error(`[${INSTANCE_ID}] Failed to start: ${err.message}`);
  process.exit(1);
});
