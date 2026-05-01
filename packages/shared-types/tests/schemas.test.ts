import { describe, it, expect } from 'vitest';
import {
  SwiggyAuthCookiesSchema,
  PhoneNumberSchema,
  OtpCodeSchema,
  SwiggyOrderSchema,
  OrderStatusSchema,
} from '../src/index.js';

describe('SwiggyAuthCookiesSchema', () => {
  it('accepts a valid cookie payload', () => {
    const valid = {
      _session_tid: 'abc123',
      tid: 'tid123',
      sid: 'sid123',
      capturedAt: '2026-05-01T12:00:00+05:30',
      phoneLast4: '1234',
    };
    expect(SwiggyAuthCookiesSchema.parse(valid)).toEqual(valid);
  });

  it('rejects missing required cookie', () => {
    expect(() =>
      SwiggyAuthCookiesSchema.parse({
        tid: 'x',
        sid: 'x',
        capturedAt: '2026-05-01T12:00:00+05:30',
        phoneLast4: '1234',
      }),
    ).toThrow();
  });

  it('rejects bad phoneLast4', () => {
    expect(() =>
      SwiggyAuthCookiesSchema.parse({
        _session_tid: 'a',
        tid: 'a',
        sid: 'a',
        capturedAt: '2026-05-01T12:00:00+05:30',
        phoneLast4: '12',
      }),
    ).toThrow();
  });
});

describe('PhoneNumberSchema', () => {
  it.each(['9876543210', '6000000000', '7123456789'])('accepts %s', (n) => {
    expect(PhoneNumberSchema.parse(n)).toBe(n);
  });

  it.each(['1234567890', '98765', '+919876543210', '987654321'])('rejects %s', (n) => {
    expect(() => PhoneNumberSchema.parse(n)).toThrow();
  });
});

describe('OtpCodeSchema', () => {
  it.each(['1234', '123456', '0000'])('accepts %s', (n) => {
    expect(OtpCodeSchema.parse(n)).toBe(n);
  });
  it.each(['12', '1234567', 'abcd'])('rejects %s', (n) => {
    expect(() => OtpCodeSchema.parse(n)).toThrow();
  });
});

describe('SwiggyOrderSchema', () => {
  it('accepts a minimal active order', () => {
    const order = {
      orderId: 'O-1',
      status: 'on_the_way' as const,
      rawStatus: 'DE_ASSIGNED',
      restaurantName: 'Burger Co',
      items: [{ name: 'Cheese Burger', quantity: 1, pricePaise: 24900 }],
      totalPaise: 24900,
      placedAt: '2026-05-01T12:00:00+05:30',
      estimatedDeliveryAt: '2026-05-01T12:30:00+05:30',
      deliveredAt: null,
      deliveryPartner: { name: 'Ravi' },
    };
    expect(SwiggyOrderSchema.parse(order).orderId).toBe('O-1');
  });

  it('rejects unknown status enum value', () => {
    expect(() => OrderStatusSchema.parse('packing')).toThrow();
  });
});
