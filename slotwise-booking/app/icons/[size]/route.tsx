import { ImageResponse } from 'next/og';

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: value } = await params;
  if (value !== '192' && value !== '512') return new Response('Not found', { status: 404 });
  const size = Number(value);
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#22694c', color: '#ffffff', fontSize: size * 0.58, fontWeight: 700 }}>S</div>,
    { width: size, height: size },
  );
}
