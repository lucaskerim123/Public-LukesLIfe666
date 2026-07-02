import { NextResponse } from 'next/server'
import { buildProtectedResourceMetadata } from '@/lib/mcp/oauth-discovery'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  return NextResponse.json(buildProtectedResourceMetadata(request))
}
