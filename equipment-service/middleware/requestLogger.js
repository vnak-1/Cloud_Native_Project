// Logs one line per request, e.g. "[equipment-1] GET /equipment 200 15ms".
// The instance name in each line is what makes `docker compose logs` show the load
// balancer alternating between equipment-1 and equipment-2.
//
// requestLogger(instance) returns the middleware, so server.js can pass the name in.
function requestLogger(instance) {
  return (req, res, next) => {
    // Docker calls /health every few seconds; logging it would bury the real requests
    if (req.path === '/health') {
      return next();
    }
    const start = Date.now();
    // 'finish' fires after the response has been sent, when the status code is known
    res.on('finish', () => {
      console.log(`[${instance}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  };
}

module.exports = requestLogger;
