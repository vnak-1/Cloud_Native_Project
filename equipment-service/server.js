const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const internalOnly = require('./middleware/internalOnly');
const requestLogger = require('./middleware/requestLogger');
const equipmentRoutes = require('./routes/equipment');
const internalRoutes = require('./routes/internal');

const required = ['PORT', 'SERVICE_NAME', 'INSTANCE_ID', 'MONGO_URI', 'INTERNAL_KEY'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Add them to .env (README.md lists them).`);
  process.exit(1);
}
const { PORT, SERVICE_NAME, INSTANCE_ID, MONGO_URI } = process.env;

const app = express();

app.use(requestLogger(INSTANCE_ID));

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson({ instance: INSTANCE_ID, ...body });
  next();
});

app.use(express.json());

app.get('/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'error', service: SERVICE_NAME });
});

app.use(internalOnly);
app.use(equipmentRoutes);
app.use(internalRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body must be valid JSON' });
  }
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) =>
      e.name === 'CastError' ? `${e.path} has an invalid value` : e.message
    );
    return res.status(400).json({ message: messages.join(', ') });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${err.path}` });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'value';
    return res.status(409).json({ message: `An item with this ${field} already exists` });
  }
  console.error(`[${INSTANCE_ID}]`, err);
  res.status(500).json({ message: 'Internal server error' });
});

async function start() {
  await connectDB(MONGO_URI, INSTANCE_ID);

  const server = app.listen(PORT, (err) => {
    if (err) {
      console.error(`[${INSTANCE_ID}] Can't listen on port ${PORT}: ${err.message}`);
      process.exit(1);
    }
    console.log(`[${INSTANCE_ID}] ${SERVICE_NAME} listening on port ${PORT}`);
  });

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
