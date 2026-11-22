import pg from 'pg';

let pool;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function snapshot(groupId, client = database()) {
  const groups = (await client.query('SELECT id, name, currency FROM groups ORDER BY created_at, id')).rows;
  const group = groups.find(g => g.id === groupId) || groups[0] || null;
  if (!group) return { groups, group: null, members: [], rates: [], expenses: [], payments: [], balances: [] };
  const id = group.id;
  const members = (await client.query('SELECT id, name FROM members WHERE group_id=$1 ORDER BY created_at, id', [id])).rows;
  const rates = (await client.query('SELECT currency, numerator::text, denominator::text FROM rates WHERE group_id=$1 ORDER BY currency', [id])).rows;
  const expenses = (await client.query(`SELECT e.id, e.description, e.paid_by, e.currency, e.amount::text, e.main_amount::text, e.split_type, e.created_at, m.name AS payer_name
    FROM expenses e JOIN members m ON m.id=e.paid_by WHERE e.group_id=$1 ORDER BY e.created_at DESC, e.id DESC`, [id])).rows;
  const shares = (await client.query('SELECT member_id, main_amount::text FROM expense_shares WHERE group_id=$1', [id])).rows;
  const payments = (await client.query(`SELECT p.id, p.payer_id, p.payee_id, p.amount::text, p.created_at, a.name AS payer_name, b.name AS payee_name
    FROM payments p JOIN members a ON a.id=p.payer_id JOIN members b ON b.id=p.payee_id WHERE p.group_id=$1 ORDER BY p.created_at DESC, p.id DESC`, [id])).rows;
  const totals = new Map(members.map(m => [m.id, 0n]));
  for (const e of expenses) totals.set(e.paid_by, totals.get(e.paid_by) + BigInt(e.main_amount));
  for (const s of shares) totals.set(s.member_id, totals.get(s.member_id) - BigInt(s.main_amount));
  for (const p of payments) {
    totals.set(p.payer_id, totals.get(p.payer_id) + BigInt(p.amount));
    totals.set(p.payee_id, totals.get(p.payee_id) - BigInt(p.amount));
  }
  return { groups, group, members, rates, expenses, payments, balances: members.map(m => ({ ...m, amount: totals.get(m.id).toString() })) };
}
