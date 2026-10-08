const path = require('path');
const os = require('os');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const internalOnly = require('./middleware/internalOnly');
const requestLogger = require('./middleware/requestLogger');
const authRoutes = require('./routes/auth');

const required = ['PORT', 'SERVICE_NAME', 'MONGO_URI', 'INTERNAL_KEY', 'JWT_SECRET'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Add them to .env (README.md lists them).`);
  process.exit(1);
}
const { PORT, SERVICE_NAME, MONGO_URI } = process.env;

const app = express();

app.use(requestLogger(SERVICE_NAME));

app.use(express.json());

app.get('/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res
    .status(dbUp ? 200 : 503)
    .json({ status: dbUp ? 'ok' : 'error', service: SERVICE_NAME, instance: os.hostname() });
});

app.use(internalOnly);
app.use(authRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body must be valid JSON' });
  }
  console.error(`[${SERVICE_NAME}]`, err);
  res.status(500).json({ message: 'Internal server error' });
});

async function start() {
  await connectDB(MONGO_URI, SERVICE_NAME);

  const server = app.listen(PORT, (err) => {
    if (err) {
      console.error(`[${SERVICE_NAME}] Can't listen on port ${PORT}: ${err.message}`);
      process.exit(1);
    }
    console.log(`[${SERVICE_NAME}] listening on port ${PORT}`);
  });

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
