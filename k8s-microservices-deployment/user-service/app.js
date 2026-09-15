'use strict';

const express = require('express');

const PORT = Number(process.env.PORT) || 3000;
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:4000';

const app = express();

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'user-service' });
});

// Public entry: user-service fetches orders from order-service (ClusterIP DNS)
app.get('/api', async (_req, res) => {
  try {
    const response = await fetch(`${ORDER_SERVICE_URL}/orders`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`order-service returned HTTP ${response.status}`);
    }

    const orders = await response.json();

    res.status(200).json({
      user: {
        name: 'user-service',
        message: 'Hello from User Service',
        id: 1,
        email: 'alice@example.com',
      },
      orders,
      combined: 'user-service → order-service communicated via K8s DNS!',
    });
  } catch (err) {
    console.error('Failed to reach order-service:', err.message);
    res.status(502).json({
      error: 'Failed to communicate with order-service',
      detail: err.message,
      orderServiceUrl: ORDER_SERVICE_URL,
    });
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`user-service listening on port ${PORT}`);
  console.log(`ORDER_SERVICE_URL=${ORDER_SERVICE_URL}`);
});

function shutdown(signal) {
  console.log(`${signal} received — draining connections`);
  server.close(() => {
    console.log('user-service shut down gracefully');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after grace period');
    process.exit(1);
  }, 25000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
