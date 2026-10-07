// Sends an allowed request on to a service, using the built-in fetch.
// It builds a NEW request instead of passing the client's request through, so only headers
// the gateway sets itself reach the service. A client can't fake x-user-* or the internal key.
function forwardTo(service) {
  return async (req, res) => {
    const headers = { 'x-internal-key': process.env.INTERNAL_KEY };
    if (req.user) {
      // Who the caller is, taken from the token authorize() just checked
      headers['x-user-id'] = String(req.user.id);
      headers['x-user-role'] = req.user.role;
      if (req.user.email) {
        headers['x-user-email'] = req.user.email;
      }
    }

    // Pass the JSON body on (GET and HEAD requests can't carry one)
    let body;
    if (req.body !== undefined && req.method !== 'GET' && req.method !== 'HEAD') {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(req.body);
    }

    let upstream;
    try {
      // The same path and query string the client used (1:1), on the service's base URL
      upstream = await fetch(service.url + req.originalUrl, {
        method: req.method,
        headers,
        body,
        signal: AbortSignal.timeout(5000), // give up after 5 seconds
      });
    } catch (err) {
      // Network error or timeout: the service is down or unreachable
      console.error(`[gateway] ${service.label} service unreachable: ${err.message}`);
      return res.status(503).json({ message: `${service.label} service unavailable` });
    }

    // When no equipment replica answers, nginx replies 502/503/504 with an HTML page.
    // Turn that into our JSON 503. JSON answers from the services pass through unchanged.
    const contentType = upstream.headers.get('content-type') ?? '';
    if ([502, 503, 504].includes(upstream.status) && !contentType.includes('application/json')) {
      return res.status(503).json({ message: `${service.label} service unavailable` });
    }

    // Send the service's status code and body back to the client as they are
    const text = await upstream.text();
    res.status(upstream.status).type(contentType || 'application/json').send(text);
  };
}

module.exports = forwardTo;
