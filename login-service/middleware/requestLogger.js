function requestLogger(name) {
  return (req, res, next) => {
    if (req.path === '/health') {
      return next();
    }
    const start = Date.now();
    res.on('finish', () => {
      console.log(`[${name}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  };
}

module.exports = requestLogger;
