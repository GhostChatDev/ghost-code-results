import { NextResponse } from 'next/server';
import { snapshot } from '../../../lib/db.mjs';
import { perform } from '../../../lib/actions.mjs';

export const dynamic = 'force-dynamic';
export async function GET(request) {
  try { return NextResponse.json(await snapshot(new URL(request.url).searchParams.get('group'))); }
  catch (error) { console.error(error); return NextResponse.json({ error: 'Could not load data. Check the database connection and migrations.' }, { status: 500 }); }
}
export async function POST(request) {
  try { return NextResponse.json(await perform(await request.json())); }
  catch (error) {
    console.error(error);
    const message = error.code ? 'Database operation failed.' : error.message;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
