import { NextResponse } from 'next/server'
import { createMcpContext } from '@/lib/mcp/context'
import { listMcpTools, runMcpTool, type McpToolRequest } from '@/lib/mcp/tool-registry'

export const runtime = 'nodejs'

type McpRouteBody = Partial<McpToolRequest>

export async function GET() {
  return NextResponse.json({
    ok: true,
    name: 'mental-health-tracker-mcp',
    tools: listMcpTools(),
  })
}

export async function POST(request: Request) {
  let body: McpRouteBody

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 }
    )
  }

  if (!body.tool) {
    return NextResponse.json(
      { ok: false, error: 'Missing MCP tool name' },
      { status: 400 }
    )
  }

  const context = await createMcpContext()
  const result = await runMcpTool(context, {
    tool: body.tool,
    input: body.input,
  } as McpToolRequest)

  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
