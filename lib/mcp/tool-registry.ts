import type { McpContext } from './context'

export type McpToolName = 'health_check'

export interface McpToolRequest {
  tool: McpToolName
  input?: Record<string, unknown>
}

export interface McpToolResult {
  ok: boolean
  tool: McpToolName
  data?: Record<string, unknown>
  error?: string
}

type McpToolHandler = (context: McpContext, input?: Record<string, unknown>) => Promise<McpToolResult>

const tools: Record<McpToolName, McpToolHandler> = {
  async health_check(context) {
    return {
      ok: true,
      tool: 'health_check',
      data: {
        status: 'ok',
        authenticated: Boolean(context.profile),
        role: context.profile?.role ?? null,
      },
    }
  },
}

export function listMcpTools(): McpToolName[] {
  return Object.keys(tools) as McpToolName[]
}

export async function runMcpTool(
  context: McpContext,
  request: McpToolRequest
): Promise<McpToolResult> {
  const handler = tools[request.tool]

  if (!handler) {
    return {
      ok: false,
      tool: request.tool,
      error: 'Unknown MCP tool',
    }
  }

  return handler(context, request.input)
}
