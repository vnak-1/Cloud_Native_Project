const mongoose = require('mongoose');

async function connectDB(uri, label) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  const dbName = mongoose.connection.name;
  console.log(`[${label}] Connected to MongoDB, database "${dbName}"`);
  if (dbName === 'test') {
    console.warn(`[${label}] Warning: MONGO_URI has no database name. Add /loandb to the end.`);
  }
}

module.exports = { connectDB };
