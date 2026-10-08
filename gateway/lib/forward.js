function forwardTo(service) {
  return async (req, res) => {
    const headers = { 'x-internal-key': process.env.INTERNAL_KEY };
    if (req.user) {
      headers['x-user-id'] = String(req.user.id);
      headers['x-user-role'] = req.user.role;
      if (req.user.email) {
        headers['x-user-email'] = req.user.email;
      }
    }

    let body;
    if (req.body !== undefined && req.method !== 'GET' && req.method !== 'HEAD') {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(req.body);
    }

    let upstream;
    try {
      upstream = await fetch(service.url + req.originalUrl, {
        method: req.method,
        headers,
        body,
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.error(`[gateway] ${service.label} service unreachable: ${err.message}`);
      return res.status(503).json({ message: `${service.label} service unavailable` });
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    if ([502, 503, 504].includes(upstream.status) && !contentType.includes('application/json')) {
      return res.status(503).json({ message: `${service.label} service unavailable` });
    }

    const text = await upstream.text();
    res.status(upstream.status).type(contentType || 'application/json').send(text);
  };
}

module.exports = forwardTo;
