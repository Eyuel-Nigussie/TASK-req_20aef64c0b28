'use strict';

const logger = require('../utils/logger');

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err && err.status ? err.status : 500;
  const body = {
    error: {
      message: err && err.message ? err.message : 'Internal error',
      code: err && err.code ? err.code : 'INTERNAL_ERROR',
    },
  };
  if (err && err.details !== undefined) body.error.details = err.details;
  if (status >= 500) {
    logger.error('request failed', {
      method: req.method,
      path: req.path,
      status,
      code: body.error.code,
      message: body.error.message,
      userId: req.user && req.user.id,
      tenantId: req.scopeTenantId || (req.user && req.user.tenantId) || null,
    });
  } else if (status === 401 || status === 403) {
    logger.warn('request denied', {
      method: req.method,
      path: req.path,
      status,
      code: body.error.code,
      userId: req.user && req.user.id,
    });
  }
  res.status(status).json(body);
}

function notFound(req, res) {
  res.status(404).json({ error: { message: 'route not found', code: 'ROUTE_NOT_FOUND' } });
}

module.exports = { errorHandler, notFound };
