'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const tenantRoutes = require('./routes/tenants');
const userRoutes = require('./routes/users');
const examItemRoutes = require('./routes/examItems');
const packageRoutes = require('./routes/packages');
const orderRoutes = require('./routes/orders');
const reconRoutes = require('./routes/reconciliation');
const reportRoutes = require('./routes/reports');
const { errorHandler, notFound } = require('./middleware/error');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/tenants', tenantRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/exam-items', examItemRoutes);
  app.use('/api/packages', packageRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/reconciliation', reconRoutes);
  app.use('/api/reports', reportRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
