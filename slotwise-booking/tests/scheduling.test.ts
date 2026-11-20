import { describe, expect, it } from 'vitest';
import { availableSlots, canModify } from '../lib/scheduling';

const base = { zone: 'America/New_York', duration: 30, hours: { opens: 60, closes: 240 }, breaks: [{ starts: 105, ends: 120 }], dayOff: false, bookings: [], now: new Date('2025-01-01T00:00:00Z') };
const iso = (dates: Date[]) => dates.map(d => d.toISOString());

describe('availability in studio time', () => {
  it('honors spring-forward hours, breaks and bookings', () => {
    const slots = iso(availableSlots({ ...base, date: '2025-03-09', bookings: [{ start: new Date('2025-03-09T07:00:00Z'), end: new Date('2025-03-09T07:30:00Z') }] }));
    expect(slots).toEqual(['2025-03-09T06:00:00.000Z', '2025-03-09T06:15:00.000Z', '2025-03-09T07:30:00.000Z']);
    expect(availableSlots({ ...base, date: '2025-03-09', dayOff: true })).toEqual([]);
    expect(availableSlots({ ...base, date: '2025-03-09', hours: null })).toEqual([]);
  });
  it('offers both real instances of repeated fall-back times', () => {
    const slots = iso(availableSlots({ ...base, date: '2025-11-02', breaks: [], hours: { opens: 60, closes: 120 } }));
    expect(slots).toContain('2025-11-02T05:00:00.000Z');
    expect(slots).toContain('2025-11-02T06:00:00.000Z');
    expect(slots).not.toContain('2025-11-02T07:00:00.000Z');
  });
});

describe('booking modification policy', () => {
  const now = new Date('2030-01-01T10:00:00Z');
  it('allows exactly two hours, rejects anything later, and allows owners', () => {
    expect(canModify('CUSTOMER', 'a', { userId: 'a', start: new Date('2030-01-01T12:00:00Z') }, now)).toBe(true);
    expect(canModify('CUSTOMER', 'a', { userId: 'a', start: new Date('2030-01-01T11:59:59Z') }, now)).toBe(false);
    expect(canModify('OWNER', 'o', { userId: 'a', start: now }, now)).toBe(true);
    expect(canModify('CUSTOMER', 'b', { userId: 'a', start: new Date('2030-01-02T12:00:00Z') }, now)).toBe(false);
  });
});
