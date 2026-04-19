'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');
const repo = require('../repositories');

function newJti() {
  return crypto.randomBytes(16).toString('hex');
}

function sign(payload, opts = {}) {
  const jti = opts.jti || newJti();
  const body = { ...payload, jti };
  if (body.gen === undefined && body.sub !== undefined && opts.gen !== undefined) {
    body.gen = opts.gen;
  }
  const token = jwt.sign(body, config.jwtSecret, {
    expiresIn: opts.expiresIn || config.jwtExpiresInSeconds,
  });
  return token;
}

async function signForUser(payload, opts = {}) {
  const gen = payload && payload.sub ? await currentGeneration(payload.sub) : 0;
  return sign(payload, { ...opts, gen });
}

function verify(token) {
  return jwt.verify(token, config.jwtSecret);
}

async function isRevoked(payload) {
  if (!payload) return false;
  if (payload.jti) {
    const byJti = await repo.revokedTokens.findOne({ jti: payload.jti, scope: 'jti' });
    if (byJti) return true;
  }
  if (payload.sub) {
    // Generation counter: each user-wide revocation increments a monotonic
    // counter. Tokens encode the generation at sign time; any token whose
    // generation is below the user's current generation is considered revoked.
    const { items } = await repo.revokedTokens.find(
      { userId: payload.sub, scope: 'all' },
      { sort: { generation: -1 }, limit: 1 }
    );
    const latest = items[0];
    if (latest) {
      const tokenGen = Number(payload.gen || 0);
      if (tokenGen < Number(latest.generation)) return true;
    }
  }
  return false;
}

async function currentGeneration(userId) {
  if (!userId) return 0;
  const { items } = await repo.revokedTokens.find(
    { userId, scope: 'all' },
    { sort: { generation: -1 }, limit: 1 }
  );
  return items[0] ? Number(items[0].generation) : 0;
}

async function revokeUserTokens(userId, reason = null) {
  if (!userId) return null;
  const gen = (await currentGeneration(userId)) + 1;
  return repo.revokedTokens.insert({
    scope: 'all',
    userId,
    generation: gen,
    jti: null,
    reason: reason || null,
    revokedAt: new Date().toISOString(),
  });
}

async function revokeJti(jti, userId = null, reason = null) {
  if (!jti) return null;
  return repo.revokedTokens.insert({
    scope: 'jti',
    jti,
    userId: userId || null,
    reason: reason || null,
    revokedAt: new Date().toISOString(),
  });
}

module.exports = { sign, signForUser, verify, isRevoked, revokeUserTokens, revokeJti, newJti, currentGeneration };
