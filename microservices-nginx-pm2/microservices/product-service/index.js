'use strict';

const express = require('express');
const app     = express();
const PORT    = process.env.PORT || 3002;

app.use(express.json());

const products = [
  { id: 1, name: 'Laptop',     price: 999,  stock: 50,  category: 'electronics' },
  { id: 2, name: 'Smartphone', price: 499,  stock: 120, category: 'electronics' },
  { id: 3, name: 'Tablet',     price: 299,  stock: 75,  category: 'electronics' },
  { id: 4, name: 'Headphones', price: 149,  stock: 200, category: 'accessories' },
];

app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'product-service',
    uptime:  process.uptime(),
    pid:     process.pid,
    memory:  process.memoryUsage().rss,
  });
});

app.get('/api/products', (req, res) => {
  res.json({ service: 'product-service', count: products.length, data: products });
});

app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ service: 'product-service', data: product });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.listen(PORT, () =>
  console.log(`[product-service] Running on port ${PORT} | PID: ${process.pid}`)
);
