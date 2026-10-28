const client = require('prom-client');

// Collect default Node.js metrics (CPU, Memory, Event Loop, GC)
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });

// Custom metric to count HTTP requests
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status']
});

// Middleware to track requests
const metricsMiddleware = (req, res, next) => {
  res.on('finish', () => {
    // We only track API routes, and we use the route template to avoid huge labels
    if (req.originalUrl.startsWith('/api')) {
      const route = req.route ? req.baseUrl + req.route.path : req.originalUrl.split('?')[0];
      httpRequestCounter.inc({
        method: req.method,
        route: route,
        status: res.statusCode
      });
    }
  });
  next();
};

// Handler for the /metrics endpoint
const metricsHandler = async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
};

module.exports = { metricsMiddleware, metricsHandler };
