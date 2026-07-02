import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import type { NextRequest } from 'next/server'

type RegisteredClient = {
  client_id: string
  client_secret: string
  redirect_uris: string[]
  token_endpoint_auth_method: 'client_secret_post'
  client_name?: string
}

type AuthorizationCodePayload = {
  typ: 'auth_code'
  client_id: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: 'S256'
  exp: number
}

type AccessTokenPayload = {
  typ: 'access_token'
  sub: string
  scope: string
  exp: number
}

const CLIENTS_FILE = path.join(process.cwd(), 'logs', 'oauth-clients.json')

function getOauthSecret() {
  return (
    process.env.MCP_OAUTH_SECRET?.trim() ||
    process.env.MCP_API_KEY?.trim() ||
    ''
  )
}

function getApprovalCode() {
  return (
    process.env.MCP_OAUTH_APPROVAL_CODE?.trim() ||
    process.env.MCP_API_KEY?.trim() ||
    ''
  )
}

export function getOauthMode() {
  return (process.env.MCP_AUTH_MODE ?? 'api_key').trim().toLowerCase()
}

export function getBaseUrl(request: Request | NextRequest) {
  const url = new URL(request.url)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host')
  const proto = forwardedProto?.split(',')[0]?.trim() || url.protocol.replace(':', '')
  const host = forwardedHost?.split(',')[0]?.trim() || request.headers.get('host') || url.host
  return `${proto}://${host}`
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

function sign(parts: string[]) {
  const secret = getOauthSecret()
  if (!secret) {
    throw new Error('Missing OAuth signing secret. Set MCP_OAUTH_SECRET or MCP_API_KEY.')
  }

  return createHmac('sha256', secret).update(parts.join('.')).digest('base64url')
}

function encodeToken(payload: AuthorizationCodePayload | AccessTokenPayload) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify(payload))
  const signature = sign([header, body])
  return `${header}.${body}.${signature}`
}

function decodeToken<T extends AuthorizationCodePayload | AccessTokenPayload>(token: string): T {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token format')
  }

  const [header, body, signature] = parts
  const expected = sign([header, body])
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('Invalid token signature')
  }

  const payload = JSON.parse(base64UrlDecode(body)) as T
  if (Date.now() >= payload.exp * 1000) {
    throw new Error('Token expired')
  }

  return payload
}

async function ensureClientsFile() {
  await fs.mkdir(path.dirname(CLIENTS_FILE), { recursive: true })
  try {
    await fs.access(CLIENTS_FILE)
  } catch {
    await fs.writeFile(CLIENTS_FILE, '[]', 'utf8')
  }
}

async function readClients() {
  await ensureClientsFile()
  const raw = await fs.readFile(CLIENTS_FILE, 'utf8')
  return JSON.parse(raw) as RegisteredClient[]
}

async function writeClients(clients: RegisteredClient[]) {
  await ensureClientsFile()
  await fs.writeFile(CLIENTS_FILE, JSON.stringify(clients, null, 2), 'utf8')
}

export async function registerClient(input: {
  redirect_uris: string[]
  token_endpoint_auth_method?: 'client_secret_post'
  client_name?: string
}) {
  const clients = await readClients()
  const client: RegisteredClient = {
    client_id: randomUUID(),
    client_secret: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
    redirect_uris: input.redirect_uris,
    token_endpoint_auth_method: 'client_secret_post',
    client_name: input.client_name,
  }

  clients.push(client)
  await writeClients(clients)
  return client
}

export async function getClient(clientId: string) {
  const clients = await readClients()
  return clients.find(client => client.client_id === clientId) ?? null
}

export function issueAuthorizationCode(input: {
  client_id: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: 'S256'
}) {
  return encodeToken({
    typ: 'auth_code',
    client_id: input.client_id,
    redirect_uri: input.redirect_uri,
    code_challenge: input.code_challenge,
    code_challenge_method: input.code_challenge_method,
    exp: Math.floor(Date.now() / 1000) + 300,
  })
}

function sha256Base64Url(value: string) {
  return createHash('sha256').update(value).digest('base64url')
}

export async function exchangeAuthorizationCode(input: {
  code: string
  client_id: string
  redirect_uri: string
  code_verifier: string
  client_secret?: string | null
}) {
  const payload = decodeToken<AuthorizationCodePayload>(input.code)
  if (payload.typ !== 'auth_code') {
    throw new Error('Invalid authorization code')
  }

  const client = await getClient(input.client_id)
  if (!client) {
    throw new Error('Unknown client')
  }

  if (client.token_endpoint_auth_method === 'client_secret_post') {
    if (client.client_secret !== (input.client_secret ?? null)) {
      throw new Error('Invalid client credentials')
    }
  }

  if (payload.client_id !== input.client_id || payload.redirect_uri !== input.redirect_uri) {
    throw new Error('Authorization code does not match client request')
  }

  if (!client.redirect_uris.includes(input.redirect_uri)) {
    throw new Error('Unregistered redirect URI')
  }

  if (payload.code_challenge_method !== 'S256') {
    throw new Error('Unsupported code challenge method')
  }

  const computedChallenge = sha256Base64Url(input.code_verifier)
  if (computedChallenge !== payload.code_challenge) {
    throw new Error('Invalid PKCE verifier')
  }

  const userId = process.env.MCP_USER_ID?.trim()
  if (!userId) {
    throw new Error('Missing required environment variable: MCP_USER_ID')
  }

  return {
    access_token: encodeToken({
      typ: 'access_token',
      sub: userId,
      scope: 'mcp',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'mcp',
  }
}

export function validateAccessToken(token: string) {
  const payload = decodeToken<AccessTokenPayload>(token)
  if (payload.typ !== 'access_token') {
    throw new Error('Invalid access token')
  }
  return payload
}

export function isApprovalCodeValid(value: string) {
  const expected = getApprovalCode()
  if (!expected) {
    throw new Error('Missing approval code. Set MCP_OAUTH_APPROVAL_CODE or MCP_API_KEY.')
  }

  return timingSafeEqual(Buffer.from(value.trim()), Buffer.from(expected))
}
