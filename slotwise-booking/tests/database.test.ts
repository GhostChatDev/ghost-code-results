import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

// Use a dedicated test database: this suite writes and deletes its own fixtures.
const db = new PrismaClient();
const key = randomUUID();
const studioId = `test-${key}`;
const serviceId = `service-${key}`;
const userId = `user-${key}`;
const insert = (id: string, start: string, end: string) => db.booking.create({ data: { id, studioId, serviceId, userId, start: new Date(start), end: new Date(end) } });

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must point to a migrated test database');
  await db.studio.create({ data: { id: studioId, name: 'Test studio', timezone: 'UTC' } });
  await db.user.create({ data: { id: userId, name: 'Test customer', email: `${key}@example.com`, passwordHash: 'test' } });
  await db.service.create({ data: { id: serviceId, studioId, name: 'Test service', duration: 60, price: 1000 } });
});
afterAll(async () => {
  await db.booking.deleteMany({ where: { studioId } });
  await db.service.deleteMany({ where: { studioId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.studio.deleteMany({ where: { id: studioId } });
  await db.$disconnect();
});

describe('Postgres overlap constraint', () => {
  it('rejects an overlapping booking but permits adjacent and cancelled slots', async () => {
    await insert(`first-${key}`, '2030-01-01T10:00:00Z', '2030-01-01T11:00:00Z');
    await expect(insert(`overlap-${key}`, '2030-01-01T10:30:00Z', '2030-01-01T11:30:00Z')).rejects.toThrow();
    await insert(`adjacent-${key}`, '2030-01-01T11:00:00Z', '2030-01-01T12:00:00Z');
    await db.booking.update({ where: { id: `first-${key}` }, data: { status: 'CANCELLED' } });
    await insert(`replacement-${key}`, '2030-01-01T10:00:00Z', '2030-01-01T11:00:00Z');
  });
  it('allows exactly one of two simultaneous overlapping inserts', async () => {
    const results = await Promise.allSettled([
      insert(`race-a-${key}`, '2030-01-02T10:00:00Z', '2030-01-02T11:00:00Z'),
      insert(`race-b-${key}`, '2030-01-02T10:00:00Z', '2030-01-02T11:00:00Z'),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(await db.booking.count({ where: { studioId, start: new Date('2030-01-02T10:00:00Z') } })).toBe(1);
  });
});
