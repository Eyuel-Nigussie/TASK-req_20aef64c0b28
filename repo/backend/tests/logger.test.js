'use strict';

const logger = require('../src/utils/logger');

describe('logger', () => {
  test('redacts sensitive keys regardless of casing and separators', () => {
    const out = logger.redact({
      username: 'ok',
      password: 'nope',
      New_Password: 'nope2',
      Token: 'bearer',
      authorization: 'Bearer abc',
      idNumber: '123-45-6789',
      SSN: '123',
      nested: { passwordHash: 'x', ok: 1 },
      arr: [{ secret: 's', ok: 2 }],
    });
    expect(out.password).toBe('[REDACTED]');
    expect(out.New_Password).toBe('[REDACTED]');
    expect(out.Token).toBe('[REDACTED]');
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.idNumber).toBe('[REDACTED]');
    expect(out.SSN).toBe('[REDACTED]');
    expect(out.nested.passwordHash).toBe('[REDACTED]');
    expect(out.nested.ok).toBe(1);
    expect(out.arr[0].secret).toBe('[REDACTED]');
    expect(out.arr[0].ok).toBe(2);
  });

  test('handles primitives, arrays, null, undefined, and circular refs', () => {
    expect(logger.redact(null)).toBeNull();
    expect(logger.redact(undefined)).toBeUndefined();
    expect(logger.redact(5)).toBe(5);
    expect(logger.redact('s')).toBe('s');
    const a = { name: 'a' };
    a.self = a;
    const out = logger.redact(a);
    expect(out.self).toBe('[Circular]');
  });

  test('info/warn/error are no-ops in NODE_ENV=test but callable', () => {
    expect(() => logger.info('hello', { password: 'x' })).not.toThrow();
    expect(() => logger.warn('warn', { token: 't' })).not.toThrow();
    expect(() => logger.error('oops', { idNumber: '123' })).not.toThrow();
    const child = logger.child({ reqId: 'r1' });
    expect(() => child.info('c', { a: 1 })).not.toThrow();
    expect(() => child.warn('c')).not.toThrow();
    expect(() => child.error('c')).not.toThrow();
  });

  test('emits when logging is not silenced (exercises emit path)', () => {
    const prevNode = process.env.NODE_ENV;
    const prevSilent = process.env.CLINICOPS_LOG_SILENT;
    process.env.NODE_ENV = 'development';
    delete process.env.CLINICOPS_LOG_SILENT;
    jest.resetModules();
    const fresh = require('../src/utils/logger');
    const infoSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      fresh.info('hello', { password: 'nope' });
      fresh.warn('warn', { token: 'redact-me' });
      fresh.error('fail', { idNumber: '1' });
      expect(infoSpy).toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalled();
      const msg = infoSpy.mock.calls[0][0];
      expect(msg).toContain('INFO');
      expect(msg).toContain('[REDACTED]');
    } finally {
      infoSpy.mockRestore();
      errSpy.mockRestore();
      process.env.NODE_ENV = prevNode;
      if (prevSilent !== undefined) process.env.CLINICOPS_LOG_SILENT = prevSilent;
      else delete process.env.CLINICOPS_LOG_SILENT;
      jest.resetModules();
    }
  });

  test('gracefully handles unserializable payloads', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    jest.resetModules();
    const fresh = require('../src/utils/logger');
    const infoSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const bad = { get trap() { throw new Error('boom'); } };
    try {
      fresh.info('x', bad);
      expect(infoSpy).toHaveBeenCalled();
    } finally {
      infoSpy.mockRestore();
      process.env.NODE_ENV = prev;
      jest.resetModules();
    }
  });
});
