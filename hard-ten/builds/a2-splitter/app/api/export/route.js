import { database } from '../../../lib/db.mjs';
export const dynamic = 'force-dynamic';
function csv(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export async function GET(request) {
  const id = new URL(request.url).searchParams.get('group');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) return new Response('Invalid group', { status: 400 });
  try {
    const rows = (await database().query(`SELECT e.created_at, e.description, m.name AS paid_by, e.currency, e.amount::text, e.main_amount::text, e.split_type
      FROM expenses e JOIN members m ON m.id=e.paid_by WHERE e.group_id=$1 ORDER BY e.created_at, e.id`, [id])).rows;
    const lines = [['Date', 'Description', 'Paid by', 'Currency', 'Amount (minor units)', 'Main amount (minor units)', 'Split']];
    for (const r of rows) lines.push([r.created_at.toISOString(), r.description, r.paid_by, r.currency, r.amount, r.main_amount, r.split_type]);
    return new Response(lines.map(row => row.map(csv).join(',')).join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="evenstep-expenses.csv"', 'Cache-Control': 'no-store' } });
  } catch (error) { console.error(error); return new Response('Could not export expenses.', { status: 500 }); }
}
