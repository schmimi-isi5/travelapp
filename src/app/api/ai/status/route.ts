import { NextResponse } from 'next/server';
import { createProviderFromEnv } from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(createProviderFromEnv().status());
}
