import { getBaseUrl } from './oauth'

export function buildAuthorizationServerMetadata(request: Request) {
  const baseUrl = getBaseUrl(request)

  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    registration_endpoint: `${baseUrl}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
  }
}

export function buildProtectedResourceMetadata(request: Request) {
  const baseUrl = getBaseUrl(request)

  return {
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    resource_documentation: `${baseUrl}/api/mcp`,
  }
}
