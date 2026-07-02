import { NextResponse } from 'next/server'
import { exchangeAuthorizationCode } from '@/lib/mcp/oauth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const bodyText = await request.text()
  const body = new URLSearchParams(bodyText)

  const grantType = body.get('grant_type')
  const code = body.get('code') ?? ''
  const clientId = body.get('client_id') ?? ''
  const clientSecret = body.get('client_secret')
  const redirectUri = body.get('redirect_uri') ?? ''
  const codeVerifier = body.get('code_verifier') ?? ''

  if (grantType !== 'authorization_code') {
    return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400 })
  }

  try {
    const token = await exchangeAuthorizationCode({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    })

    return NextResponse.json(token)
  } catch (error) {
    return NextResponse.json(
      { error: 'invalid_grant', error_description: error instanceof Error ? error.message : 'OAuth token exchange failed' },
      { status: 400 }
    )
  }
}
