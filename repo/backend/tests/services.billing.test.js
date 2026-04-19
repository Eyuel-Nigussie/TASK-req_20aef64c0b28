'use strict';

const billing = require('../src/services/billing');
const wechat = require('../src/services/wechatAdapter');
const config = require('../src/config');

// ─── billing: computeLine ─────────────────────────────────────────────────────

describe('billing: computeLine', () => {
  test('computes line amount correctly', () => {
    const line = billing.computeLine({ description: 'Exam', quantity: 3, unitPrice: 50 });
    expect(line.subtotal).toBe(150);
    expect(line.quantity).toBe(3);
    expect(line.unitPrice).toBe(50);
    expect(line.billingType).toBeNull();
  });

  test('includes optional fields when provided', () => {
    const line = billing.computeLine({
      description: 'Bundle', quantity: 1, unitPrice: 100,
      billingType: 'AMOUNT', packageId: 'pkg1', packageVersion: 2, bundleOf: ['a', 'b'],
    });
    expect(line.billingType).toBe('AMOUNT');
    expect(line.packageId).toBe('pkg1');
    expect(line.packageVersion).toBe(2);
    expect(line.bundleOf).toEqual(['a', 'b']);
  });

  test('throws VALIDATION for missing description', () => {
    expect(() => billing.computeLine({ quantity: 1, unitPrice: 10 }))
      .toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });

  test('throws VALIDATION for zero quantity', () => {
    expect(() => billing.computeLine({ description: 'X', quantity: 0, unitPrice: 10 }))
      .toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });

  test('throws VALIDATION for negative quantity', () => {
    expect(() => billing.computeLine({ description: 'X', quantity: -1, unitPrice: 10 }))
      .toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });

  test('throws VALIDATION for negative unitPrice', () => {
    expect(() => billing.computeLine({ description: 'X', quantity: 1, unitPrice: -0.01 }))
      .toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });
});

// ─── billing: computeInvoice ──────────────────────────────────────────────────

describe('billing: computeInvoice', () => {
  test('computes subtotal, tax, and total', () => {
    const inv = billing.computeInvoice({
      lines: [{ description: 'Test', quantity: 2, unitPrice: 100 }],
      discount: 0,
      taxRate: 0.1,
    });
    expect(inv.subtotal).toBe(200);
    expect(inv.tax).toBe(20);
    expect(inv.total).toBe(220);
    expect(inv.discount).toBe(0);
  });

  test('applies discount before tax', () => {
    const inv = billing.computeInvoice({
      lines: [{ description: 'A', quantity: 1, unitPrice: 200 }],
      discount: 50,
      taxRate: 0,
    });
    expect(inv.subtotal).toBe(200);
    expect(inv.discount).toBe(50);
    expect(inv.total).toBe(150);
  });

  test('sums multiple lines correctly', () => {
    const inv = billing.computeInvoice({
      lines: [
        { description: 'A', quantity: 2, unitPrice: 50 },
        { description: 'B', quantity: 1, unitPrice: 30 },
      ],
      discount: 0,
      taxRate: 0,
    });
    expect(inv.subtotal).toBe(130);
    expect(inv.total).toBe(130);
    expect(inv.lines).toHaveLength(2);
  });

  test('throws VALIDATION for empty lines array', () => {
    expect(() => billing.computeInvoice({ lines: [], discount: 0, taxRate: 0 }))
      .toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });

  test('throws VALIDATION for non-array lines', () => {
    expect(() => billing.computeInvoice({ lines: null, discount: 0, taxRate: 0 }))
      .toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });

  test('throws VALIDATION for discount exceeding subtotal', () => {
    expect(() => billing.computeInvoice({
      lines: [{ description: 'X', quantity: 1, unitPrice: 10 }],
      discount: 15, taxRate: 0,
    })).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });

  test('throws VALIDATION for taxRate > 1', () => {
    expect(() => billing.computeInvoice({
      lines: [{ description: 'X', quantity: 1, unitPrice: 10 }],
      discount: 0, taxRate: 1.5,
    })).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });

  test('throws VALIDATION for negative taxRate', () => {
    expect(() => billing.computeInvoice({
      lines: [{ description: 'X', quantity: 1, unitPrice: 10 }],
      discount: 0, taxRate: -0.1,
    })).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });

  test('throws VALIDATION for negative discount', () => {
    expect(() => billing.computeInvoice({
      lines: [{ description: 'X', quantity: 1, unitPrice: 10 }],
      discount: -1, taxRate: 0,
    })).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });
});

// ─── wechatAdapter ────────────────────────────────────────────────────────────

describe('wechatAdapter', () => {
  afterEach(() => {
    config.wechatOAuthEnabled = false;
  });

  test('isEnabled returns false by default', () => {
    config.wechatOAuthEnabled = false;
    expect(wechat.isEnabled()).toBe(false);
  });

  test('isEnabled returns true when enabled', () => {
    config.wechatOAuthEnabled = true;
    expect(wechat.isEnabled()).toBe(true);
  });

  test('exchangeCode throws WECHAT_DISABLED when not enabled', async () => {
    config.wechatOAuthEnabled = false;
    await expect(wechat.exchangeCode('someCode'))
      .rejects.toHaveProperty('code', 'WECHAT_DISABLED');
  });

  test('exchangeCode throws VALIDATION for null code when enabled', async () => {
    config.wechatOAuthEnabled = true;
    await expect(wechat.exchangeCode(null))
      .rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('exchangeCode throws WECHAT_NOT_CONFIGURED (stub) when enabled with valid code', async () => {
    config.wechatOAuthEnabled = true;
    await expect(wechat.exchangeCode('testCode'))
      .rejects.toHaveProperty('code', 'WECHAT_NOT_CONFIGURED');
  });

  test('bindMobile throws WECHAT_DISABLED when not enabled', async () => {
    config.wechatOAuthEnabled = false;
    await expect(wechat.bindMobile('u1', '1234', 'otp'))
      .rejects.toHaveProperty('code', 'WECHAT_DISABLED');
  });

  test('bindMobile throws VALIDATION for missing fields when enabled', async () => {
    config.wechatOAuthEnabled = true;
    await expect(wechat.bindMobile(null, null, null))
      .rejects.toHaveProperty('code', 'VALIDATION');
  });

  test('bindMobile throws WECHAT_NOT_CONFIGURED (stub) when enabled with valid args', async () => {
    config.wechatOAuthEnabled = true;
    await expect(wechat.bindMobile('u1', '+1234567890', '123456'))
      .rejects.toHaveProperty('code', 'WECHAT_NOT_CONFIGURED');
  });
});
