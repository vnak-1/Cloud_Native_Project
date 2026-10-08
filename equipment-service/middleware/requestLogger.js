function requestLogger(instance) {
  return (req, res, next) => {
    if (req.path === '/health') {
      return next();
    }
    const start = Date.now();
    res.on('finish', () => {
      console.log(`[${instance}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  };
}

module.exports = requestLogger;
