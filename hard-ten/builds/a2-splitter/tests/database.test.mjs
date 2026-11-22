import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { perform } from '../lib/actions.mjs';
import { snapshot } from '../lib/db.mjs';

const url = process.env.DATABASE_URL;
if (!url && process.env.REQUIRE_DATABASE_TESTS) throw new Error('DATABASE_URL is required for the database integration test.');

test('real PostgreSQL persists expenses and payments exactly once on retry', { skip: !url && 'Set DATABASE_URL to run the PostgreSQL integration test' }, async () => {
  const pool = new pg.Pool({ connectionString: url });
  const groupId = randomUUID(), alice = randomUUID(), bob = randomUUID();
  const expenseId = randomUUID(), paymentId = randomUUID();
  const act = input => perform(input, pool);
  try {
    // Each test runner needs its own migrated database; CI may isolate workflow steps.
    for (const name of (await readdir('migrations')).filter(name => name.endsWith('.sql')).sort()) {
      await pool.query(await readFile(`migrations/${name}`, 'utf8'));
    }
    await act({ action: 'group', id: groupId, name: 'Integration group', currency: 'USD' });
    await act({ action: 'member', id: alice, groupId, name: 'Alex' });
    await act({ action: 'member', id: bob, groupId, name: 'Sam' });
    await act({ action: 'rate', id: randomUUID(), groupId, currency: 'EUR', rate: '1.25' });
    const expense = { action: 'expense', id: expenseId, groupId, description: 'Dinner', paidBy: alice, currency: 'EUR', amount: '10.00', splitType: 'equal', shares: [{ id: alice }, { id: bob }] };
    await Promise.all([act(expense), act(expense)]);
    const stored = await pool.query('SELECT amount::text, main_amount::text FROM expenses WHERE id=$1', [expenseId]);
    assert.equal(stored.rowCount, 1);
    assert.deepEqual(stored.rows[0], { amount: '1000', main_amount: '1250' });
    const shares = await pool.query('SELECT amount::text, main_amount::text FROM expense_shares WHERE expense_id=$1', [expenseId]);
    assert.equal(shares.rowCount, 2);
    assert.ok(shares.rows.every(row => row.amount === '500' && row.main_amount === '625'));
    let data = await snapshot(groupId, pool);
    assert.equal(data.balances.find(x => x.id === alice).amount, '625');
    assert.equal(data.balances.find(x => x.id === bob).amount, '-625');
    const payment = { action: 'payment', id: paymentId, groupId, payer: bob, payee: alice, amount: '6.25' };
    await Promise.all([act(payment), act(payment)]);
    data = await snapshot(groupId, pool);
    assert.equal(data.payments.length, 1);
    assert.ok(data.balances.every(x => x.amount === '0'));
    const invalid = { ...expense, id: randomUUID(), splitType: 'percentage', shares: [{ id: alice, value: '50' }, { id: bob, value: '49' }] };
    await assert.rejects(act(invalid), /Percentages must add up/);
    assert.equal((await pool.query('SELECT 1 FROM expenses WHERE id=$1', [invalid.id])).rowCount, 0);
  } finally {
    try {
      // Remove referencing records before the group's members are cascaded.
      await pool.query('DELETE FROM payments WHERE group_id=$1', [groupId]);
      await pool.query('DELETE FROM expenses WHERE group_id=$1', [groupId]);
      await pool.query('DELETE FROM groups WHERE id=$1', [groupId]);
    } finally {
      await pool.end();
    }
  }
});
