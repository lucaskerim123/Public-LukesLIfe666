import { NextResponse } from 'next/server'
import { createMcpContext } from '@/lib/mcp/context'
import { exportIncidentTool } from '@/lib/mcp/exportincident-tool'
import { listMcpTools, runMcpTool, type McpToolRequest } from '@/lib/mcp/tool-registry'

export const runtime = 'nodejs'

type McpRouteBody = Partial<McpToolRequest>

const restoredTools = [
  'exportincident',
  'startsesh',
  'stopsesh',
  'seshinfo',
  'seshlist',
  'addsleep',
  'moodadd',
  'addnote',
  'loguse',
  'usehistory',
  'createincident',
  'lockdown',
  'help',
]

function placeholderTool(tool: string) {
  return {
    ok: false,
    tool,
    error: `${tool} is listed but its web MCP handler is still being restored.`,
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    name: 'mental-health-tracker-mcp',
    tools: Array.from(new Set([...listMcpTools(), ...restoredTools])),
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
  const toolName = body.tool.replace(/^\//, '')
  const result = toolName === 'exportincident'
    ? await exportIncidentTool(context, body.input)
    : restoredTools.includes(toolName)
      ? placeholderTool(toolName)
      : await runMcpTool(context, {
        tool: body.tool,
        input: body.input,
      } as McpToolRequest)

  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
