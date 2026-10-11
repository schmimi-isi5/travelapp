import { serverSupabaseUrl } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

// Optimised library photos live in the public bucket `destination-media`. The gateway wants an API key even for public
// objects, which an <img> tag cannot send, so the app serves them from its own origin (also what the offline cache needs).
const PATH = /^[a-z0-9-]+\/[a-f0-9]{12}-(hero|card|gallery)-(desktop|tablet|mobile|card|full|thumb)\.webp$/;

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const objectPath = path.join('/');
  const base = serverSupabaseUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!PATH.test(objectPath) || !base || !anonKey) return new Response('not found', { status: 404 });
  const upstream = await fetch(`${base}/storage/v1/object/public/destination-media/${objectPath}`, { headers: { apikey: anonKey }, cache: 'no-store' });
  // the storage API answers a missing object with 400 or 404; anything else is an upstream problem
  if (!upstream.ok || !upstream.body) return new Response('not found', { status: upstream.status === 404 || upstream.status === 400 ? 404 : 502 });
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'image/webp',
      // content-addressed file names: a path never changes its content
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
