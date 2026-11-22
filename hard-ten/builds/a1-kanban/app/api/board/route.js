import { getBoard, applyBoardOperation } from '../../../lib/db.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const board = await getBoard('demo');
    if (!board) return Response.json({ error: 'The demo board has not been seeded.' }, { status: 404 });
    return Response.json(board, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Board read failed:', error);
    return Response.json({ error: 'Could not load the board.' }, { status: 503 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await applyBoardOperation('demo', body);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error.name === 'OperationError' || error instanceof SyntaxError) return Response.json({ error: error.message }, { status: 400 });
    console.error('Board update failed:', error);
    return Response.json({ error: 'Could not save the change.' }, { status: 503 });
  }
}
