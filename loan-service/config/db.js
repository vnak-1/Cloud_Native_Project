const mongoose = require('mongoose');

// Connects to MongoDB once at startup.
// "async" makes the function return a Promise, and "await" pauses until the connection is
// ready, like Python's asyncio.
async function connectDB(uri, label) {
  // Give up after 10 seconds instead of the default 30 if Atlas can't be reached
  // (for example, when this machine's IP isn't allowed in Atlas Network Access).
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });

  // The database name comes from the end of MONGO_URI. If it's missing, MongoDB silently
  // uses "test", so print it to make that mistake easy to spot.
  const dbName = mongoose.connection.name;
  console.log(`[${label}] Connected to MongoDB, database "${dbName}"`);
  if (dbName === 'test') {
    console.warn(`[${label}] Warning: MONGO_URI has no database name. Add /loandb to the end.`);
  }
}

module.exports = { connectDB };
