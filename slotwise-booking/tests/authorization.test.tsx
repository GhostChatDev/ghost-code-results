import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'customer-a', name: 'Alex', email: 'alex@example.com', role: 'CUSTOMER' as const },
  findBooking: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), slots: vi.fn(),
}));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('../lib/security', () => ({ currentUser: async () => mocks.user, rateLimit: async () => true, createSession: vi.fn(), endSession: vi.fn() }));
vi.mock('../lib/availability', () => ({ slotsFor: mocks.slots }));
vi.mock('../lib/db', () => {
  const client = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    studio: { findUnique: vi.fn().mockResolvedValue({ id: 'studio', timezone: 'UTC', services: [] }) },
    service: { findFirst: vi.fn().mockResolvedValue({ id: 'service', duration: 60 }) },
    booking: { findUnique: mocks.findBooking, findMany: mocks.findMany, updateMany: mocks.updateMany, update: mocks.update },
  };
  return { db: { ...client, $transaction: (fn: (tx: typeof client) => unknown) => fn(client) } };
});
import { cancelBooking, saveBooking } from '../app/actions';
import Book from '../app/book/page';
import Bookings from '../app/bookings/page';

describe('customer booking authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('React', React);
    mocks.findBooking.mockResolvedValue({ id: 'booking-b', userId: 'customer-b', status: 'ACTIVE', serviceId: 'service', start: new Date('2099-01-01T10:00:00Z') });
    mocks.findMany.mockResolvedValue([]);
    mocks.slots.mockResolvedValue([new Date('2099-01-02T10:00:00Z')]);
  });
  it('queries only the signed-in customer’s booking list', async () => {
    await Bookings({ searchParams: Promise.resolve({}) });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'customer-a' } }));
  });
  it('does not expose another customer’s booking on the reschedule page', async () => {
    const page = await Book({ searchParams: Promise.resolve({ booking: 'booking-b' }) });
    expect(JSON.stringify(page)).not.toContain('customer-b');
    expect(JSON.stringify(page)).toContain('Booking unavailable');
    expect(mocks.slots).not.toHaveBeenCalled();
  });
  it('rejects cancelling another customer’s booking', async () => {
    const form = new FormData(); form.set('bookingId', 'booking-b');
    await expect(cancelBooking(form)).rejects.toThrow('REDIRECT:/bookings?error=');
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it('rejects rescheduling another customer’s booking', async () => {
    const form = new FormData(); form.set('bookingId', 'booking-b'); form.set('serviceId', 'service'); form.set('start', '2099-01-02T10:00:00Z');
    await expect(saveBooking(form)).rejects.toThrow('REDIRECT:/bookings?error=');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
