import { Readable } from 'node:stream';
import archiver from 'archiver';
import { deleteNote, getNote, history, listNotes, saveNote } from '../../../lib/notes.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body, status = 200) => Response.json(body, { status });
function fail(error) {
  console.error(error);
  const message = error.message || '';
  return /^(Invalid|Note is too large)/.test(message) ? json({ error: message }, 400) : json({ error: 'The database request failed. Check the server configuration and try again.' }, 500);
}
function filename(note) {
  return (note.title.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'untitled') + '-' + note.id.slice(0, 8) + '.md';
}
export async function GET(request, { params }) {
  try {
    const parts = (await params).path || [];
    if (parts.length === 0) return json(await listNotes(new URL(request.url).searchParams.get('q') || ''));
    if (parts.length === 1 && parts[0] === 'export') {
      const notes = await listNotes();
      const archive = archiver('zip', { zlib: { level: 9 } });
      for (const note of notes) archive.append(note.body, { name: filename(note) });
      const stream = Readable.toWeb(archive);
      archive.finalize().catch(error => archive.destroy(error));
      return new Response(stream, { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="quillstack-notes.zip"' } });
    }
    if (parts.length === 2 && parts[1] === 'history') return json(await history(parts[0]));
    if (parts.length === 2 && parts[1] === 'export') {
      const note = await getNote(parts[0]);
      if (!note) return json({ error: 'Note not found' }, 404);
      return new Response(note.body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename(note)}"` } });
    }
    if (parts.length === 1) { const note = await getNote(parts[0]); return note ? json(note) : json({ error: 'Note not found' }, 404); }
    return json({ error: 'Not found' }, 404);
  } catch (error) { return fail(error); }
}
export async function POST(request, { params }) {
  try {
    const parts = (await params).path || [];
    if (parts.length !== 1) return json({ error: 'Not found' }, 404);
    const input = await request.json();
    const result = await saveNote({ ...input, id: parts[0] });
    return json(result, result.conflict ? 409 : result.notFound ? 404 : 200);
  } catch (error) { return fail(error); }
}
export async function DELETE(request, { params }) {
  try {
    const parts = (await params).path || [];
    if (parts.length !== 1) return json({ error: 'Not found' }, 404);
    const result = await deleteNote(parts[0], Number(new URL(request.url).searchParams.get('revision')));
    return json(result, result.conflict ? 409 : 200);
  } catch (error) { return fail(error); }
}
