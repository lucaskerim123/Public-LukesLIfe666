import { NextResponse } from 'next/server'
import { buildAuthorizationServerMetadata } from '@/lib/mcp/oauth-discovery'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  return NextResponse.json(buildAuthorizationServerMetadata(request))
}
