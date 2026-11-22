import { database } from './db.mjs';
import { allocate, cents, convert, rate, split } from './money.mjs';

const currencies = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'NZD', 'SGD']);
function currency(value) {
  const c = String(value || '').toUpperCase();
  if (!currencies.has(c)) throw new Error('Choose a supported two-decimal currency.');
  return c;
}
function text(value, max) {
  const s = String(value || '').trim();
  if (!s || s.length > max) throw new Error(`Enter text between 1 and ${max} characters.`);
  return s;
}
function uuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value))) throw new Error('Invalid identifier.');
  return value;
}
async function member(client, group, id) {
  if (!(await client.query('SELECT 1 FROM members WHERE group_id=$1 AND id=$2', [group, uuid(id)])).rowCount) throw new Error('Member not found in this group.');
}

export async function perform(input, pool = database()) {
  const id = uuid(input.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (input.action === 'group') {
      await client.query('INSERT INTO groups(id,name,currency) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING', [id, text(input.name, 100), currency(input.currency)]);
    } else {
      const groupId = uuid(input.groupId);
      const found = await client.query('SELECT * FROM groups WHERE id=$1 FOR UPDATE', [groupId]);
      if (!found.rowCount) throw new Error('Group not found.');
      const group = found.rows[0];
      if (input.action === 'member') {
        await client.query('INSERT INTO members(id,group_id,name) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING', [id, groupId, text(input.name, 100)]);
      } else if (input.action === 'rate') {
        const code = currency(input.currency);
        if (code === group.currency) throw new Error('The main currency always has a rate of 1.');
        const [n, d] = rate(input.rate);
        await client.query('INSERT INTO rates(group_id,currency,numerator,denominator) VALUES($1,$2,$3,$4) ON CONFLICT(group_id,currency) DO UPDATE SET numerator=EXCLUDED.numerator, denominator=EXCLUDED.denominator', [groupId, code, n.toString(), d.toString()]);
      } else if (input.action === 'expense') {
        const exists = await client.query('SELECT 1 FROM expenses WHERE id=$1', [id]);
        if (!exists.rowCount) await addExpense(client, group, input, id);
      } else if (input.action === 'payment') {
        const exists = await client.query('SELECT 1 FROM payments WHERE id=$1', [id]);
        if (!exists.rowCount) {
          await member(client, groupId, input.payer);
          await member(client, groupId, input.payee);
          if (input.payer === input.payee) throw new Error('Choose different members.');
          const amount = cents(input.amount);
          if (amount <= 0n) throw new Error('Payment must be positive.');
          await client.query('INSERT INTO payments(id,group_id,payer_id,payee_id,amount) VALUES($1,$2,$3,$4,$5)', [id, groupId, input.payer, input.payee, amount.toString()]);
        }
      } else throw new Error('Unknown action.');
    }
    await client.query('COMMIT');
    return { id };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function addExpense(client, group, input, id) {
  const code = currency(input.currency);
  const amount = cents(input.amount);
  await member(client, group.id, input.paidBy);
  if (!Array.isArray(input.shares) || !input.shares.length || input.shares.length > 100) throw new Error('Choose at least one member.');
  const ids = input.shares.map(s => uuid(s.id));
  if (new Set(ids).size !== ids.length) throw new Error('Each member may only appear once.');
  for (const id of ids) await member(client, group.id, id);
  const portions = split(amount, input.splitType, input.shares.map(s => s.value));
  let n = 1n, d = 1n;
  if (code !== group.currency) {
    const result = await client.query('SELECT numerator::text, denominator::text FROM rates WHERE group_id=$1 AND currency=$2', [group.id, code]);
    if (!result.rowCount) throw new Error(`Set an exchange rate for ${code} first.`);
    n = BigInt(result.rows[0].numerator); d = BigInt(result.rows[0].denominator);
  }
  const main = convert(amount, n, d);
  if (main === 0n) throw new Error('The converted amount must be at least one cent.');
  const mainShares = allocate(main, portions);
  await client.query(`INSERT INTO expenses(id,group_id,description,paid_by,currency,amount,main_amount,rate_numerator,rate_denominator,split_type)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, group.id, text(input.description, 200), input.paidBy, code, amount.toString(), main.toString(), n.toString(), d.toString(), input.splitType]);
  for (let i = 0; i < ids.length; i++) {
    await client.query('INSERT INTO expense_shares(group_id,expense_id,member_id,amount,main_amount) VALUES($1,$2,$3,$4,$5)', [group.id, id, ids[i], portions[i].toString(), mainShares[i].toString()]);
  }
}
