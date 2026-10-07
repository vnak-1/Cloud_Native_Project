// Logs one line per request, e.g. "[loan-service] POST /loans 201 85ms".
//
// requestLogger(name) returns the middleware, so server.js can pass the name in.
function requestLogger(name) {
  return (req, res, next) => {
    // Docker calls /health every few seconds; logging it would bury the real requests
    if (req.path === '/health') {
      return next();
    }
    const start = Date.now();
    // 'finish' fires after the response has been sent, when the status code is known
    res.on('finish', () => {
      console.log(`[${name}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  };
}

module.exports = requestLogger;
