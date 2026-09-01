'use strict';

const express = require('express');
const app     = express();
const PORT    = process.env.PORT || 3001;

app.use(express.json());

const users = [
  { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob',   email: 'bob@example.com',   role: 'user'  },
  { id: 3, name: 'Carol', email: 'carol@example.com', role: 'user'  },
];

app.get('/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'user-service',
    uptime:  process.uptime(),
    pid:     process.pid,
    memory:  process.memoryUsage().rss,
  });
});

app.get('/api/users', (req, res) => {
  res.json({ service: 'user-service', count: users.length, data: users });
});

app.get('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ service: 'user-service', data: user });
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.listen(PORT, () =>
  console.log(`[user-service] Running on port ${PORT} | PID: ${process.pid}`)
);
