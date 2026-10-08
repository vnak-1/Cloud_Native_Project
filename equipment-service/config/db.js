const mongoose = require('mongoose');

async function connectDB(uri, instance) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  const dbName = mongoose.connection.name;
  console.log(`[${instance}] Connected to MongoDB, database "${dbName}"`);
  if (dbName === 'test') {
    console.warn(`[${instance}] Warning: MONGO_URI has no database name. Add /equipmentdb to the end.`);
  }
}

module.exports = { connectDB };
