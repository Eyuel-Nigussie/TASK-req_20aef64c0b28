'use strict';

class AppError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_ERROR', details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const bad = (msg, code = 'BAD_REQUEST', details) => new AppError(msg, 400, code, details);
const unauthorized = (msg = 'Unauthorized', code = 'UNAUTHORIZED') => new AppError(msg, 401, code);
const forbidden = (msg = 'Forbidden', code = 'FORBIDDEN') => new AppError(msg, 403, code);
const notFound = (msg = 'Not Found', code = 'NOT_FOUND') => new AppError(msg, 404, code);
const conflict = (msg, code = 'CONFLICT', details) => new AppError(msg, 409, code, details);
const tooManyRequests = (msg = 'Too Many Requests', code = 'RATE_LIMITED') => new AppError(msg, 429, code);

module.exports = { AppError, bad, unauthorized, forbidden, notFound, conflict, tooManyRequests };
