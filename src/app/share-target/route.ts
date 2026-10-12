import { NextResponse } from 'next/server';

/**
 * Fallback for "Teilen mit …" when the service worker is not active yet (first start after installing): the files cannot be
 * kept without it, and the server must never store them, so the user is sent to the gallery with a hint to try again.
 */
export function POST(request: Request) {
  return NextResponse.redirect(new URL('/gallery?shared=unavailable', request.url), 303);
}
