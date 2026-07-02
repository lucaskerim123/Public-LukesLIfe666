import { promises as fs } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import { getClient, isApprovalCodeValid, issueAuthorizationCode } from '@/lib/mcp/oauth'

export const runtime = 'nodejs'

const AUTHORIZE_ERROR_LOG = path.join(process.cwd(), 'logs', 'oauth-authorize-errors.log')

async function logAuthorizeFailure(reason: string, details: Record<string, string>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    reason,
    ...details,
  })

  await fs.mkdir(path.dirname(AUTHORIZE_ERROR_LOG), { recursive: true })
  await fs.appendFile(AUTHORIZE_ERROR_LOG, `${line}\n`, 'utf8')
}

function renderForm(params: {
  clientId: string
  redirectUri: string
  state?: string
  codeChallenge: string
  error?: string
}) {
  const errorBlock = params.error
    ? `<p style="color:#b91c1c;font-family:monospace;margin-bottom:12px;">${params.error}</p>`
    : ''

  return `<!doctype html>
<html>
  <body style="font-family:system-ui;background:#0a0a0a;color:#e4e4e7;padding:32px;">
    <div style="max-width:460px;margin:0 auto;border:1px solid #27272a;padding:24px;background:#09090b;">
      <h1 style="font-size:20px;margin:0 0 8px;">Authorize MCP Access</h1>
      <p style="font-size:14px;color:#a1a1aa;margin:0 0 20px;">Enter your approval code to grant this client access.</p>
      ${errorBlock}
      <form method="post">
        <input type="hidden" name="client_id" value="${params.clientId}" />
        <input type="hidden" name="redirect_uri" value="${params.redirectUri}" />
        <input type="hidden" name="state" value="${params.state ?? ''}" />
        <input type="hidden" name="code_challenge" value="${params.codeChallenge}" />
        <input type="hidden" name="code_challenge_method" value="S256" />
        <label style="display:block;font-size:12px;margin-bottom:8px;">Approval code</label>
        <input name="approval_code" type="password" style="width:100%;padding:10px;background:#000;border:1px solid #3f3f46;color:#fafafa;" />
        <button type="submit" style="margin-top:16px;padding:10px 14px;background:#18181b;color:#fafafa;border:1px solid #52525b;">Authorize</button>
      </form>
    </div>
  </body>
</html>`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const clientId = url.searchParams.get('client_id') ?? ''
  const redirectUri = url.searchParams.get('redirect_uri') ?? ''
  const state = url.searchParams.get('state') ?? ''
  const codeChallenge = url.searchParams.get('code_challenge') ?? ''
  const codeChallengeMethod = url.searchParams.get('code_challenge_method') ?? ''

  if (!clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== 'S256') {
    await logAuthorizeFailure('invalid_request', {
      client_id: clientId,
      redirect_uri: redirectUri,
      state_present: state ? 'true' : 'false',
      code_challenge_present: codeChallenge ? 'true' : 'false',
      code_challenge_method: codeChallengeMethod,
    })
    return new NextResponse('Invalid OAuth authorization request', { status: 400 })
  }

  const client = await getClient(clientId)
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    await logAuthorizeFailure('unknown_client', {
      client_id: clientId,
      redirect_uri: redirectUri,
      state_present: state ? 'true' : 'false',
    })
    return new NextResponse('Unknown OAuth client', { status: 400 })
  }

  return new NextResponse(
    renderForm({ clientId, redirectUri, state, codeChallenge }),
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  )
}

export async function POST(request: Request) {
  const form = await request.formData()
  const clientId = String(form.get('client_id') ?? '')
  const redirectUri = String(form.get('redirect_uri') ?? '')
  const state = String(form.get('state') ?? '')
  const codeChallenge = String(form.get('code_challenge') ?? '')
  const approvalCode = String(form.get('approval_code') ?? '')

  const client = await getClient(clientId)
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    await logAuthorizeFailure('unknown_client_post', {
      client_id: clientId,
      redirect_uri: redirectUri,
      state_present: state ? 'true' : 'false',
    })
    return new NextResponse('Unknown OAuth client', { status: 400 })
  }

  if (!approvalCode || !isApprovalCodeValid(approvalCode)) {
    await logAuthorizeFailure('invalid_approval_code', {
      client_id: clientId,
      redirect_uri: redirectUri,
      state_present: state ? 'true' : 'false',
    })
    return new NextResponse(
      renderForm({
        clientId,
        redirectUri,
        state,
        codeChallenge,
        error: 'Invalid approval code',
      }),
      { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } }
    )
  }

  const code = issueAuthorizationCode({
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })

  const destination = new URL(redirectUri)
  destination.searchParams.set('code', code)
  if (state) {
    destination.searchParams.set('state', state)
  }
  return NextResponse.redirect(destination)
}
