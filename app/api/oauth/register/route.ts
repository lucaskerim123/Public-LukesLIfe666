import { NextResponse } from 'next/server'
import { registerClient } from '@/lib/mcp/oauth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let body: Record<string, unknown>

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_client_metadata' }, { status: 400 })
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.map(value => String(value))
    : []

  if (redirectUris.length === 0) {
    return NextResponse.json({ error: 'redirect_uris required' }, { status: 400 })
  }

  const client = await registerClient({
    redirect_uris: redirectUris,
    token_endpoint_auth_method: 'client_secret_post',
    client_name: body.client_name ? String(body.client_name) : undefined,
  })

  return NextResponse.json({
    client_id: client.client_id,
    client_secret: client.client_secret,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    grant_types: ['authorization_code'],
    response_types: ['code'],
  })
}
