'use strict';

const express = require('express');

const PORT = Number(process.env.PORT) || 4000;
const app = express();

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'order-service' });
});

app.get('/orders', (_req, res) => {
  res.status(200).json({
    name: 'order-service',
    message: 'Hello from Order Service',
    items: [
      { id: 1, item: 'Widget', quantity: 3 },
      { id: 2, item: 'Gadget', quantity: 1 },
    ],
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`order-service listening on port ${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received — draining connections`);
  server.close(() => {
    console.log('order-service shut down gracefully');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after grace period');
    process.exit(1);
  }, 25000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
