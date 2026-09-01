'use strict';

const express = require('express');
const axios   = require('axios');
const app     = express();
const PORT    = process.env.PORT || 3003;

// Configurable via env — makes it easy to change without code edits
const PRODUCT_SVC = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

app.use(express.json());

const orders = [
  { id: 1, userId: 1, productId: 2, quantity: 1, status: 'confirmed', createdAt: '2026-08-01' },
  { id: 2, userId: 2, productId: 1, quantity: 2, status: 'pending',   createdAt: '2026-08-15' },
  { id: 3, userId: 3, productId: 3, quantity: 1, status: 'shipped',   createdAt: '2026-08-20' },
];

app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'order-service',
    uptime:  process.uptime(),
    pid:     process.pid,
    memory:  process.memoryUsage().rss,
  });
});

app.get('/api/orders', (req, res) => {
  res.json({ service: 'order-service', count: orders.length, data: orders });
});

// Service-to-service call: enrich order response with product details
app.get('/api/orders/:id', async (req, res) => {
  const order = orders.find(o => o.id === parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });

  try {
    const { data } = await axios.get(
      `${PRODUCT_SVC}/api/products/${order.productId}`,
      { timeout: 3000 }
    );
    res.json({
      service: 'order-service',
      data: { ...order, product: data.data },
    });
  } catch (err) {
    // Graceful degradation — return order even if product-service is down
    console.error(`[order-service] product-service unreachable: ${err.message}`);
    res.json({
      service: 'order-service',
      data:    order,
      warning: 'product details unavailable (product-service unreachable)',
    });
  }
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.listen(PORT, () =>
  console.log(`[order-service] Running on port ${PORT} | PID: ${process.pid}`)
);
