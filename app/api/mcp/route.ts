import { NextResponse } from 'next/server'
import { createMcpContext } from '@/lib/mcp/context'
import { exportIncidentTool } from '@/lib/mcp/exportincident-tool'
import { startSeshTool, stopSeshTool } from '@/lib/mcp/session-start-stop'
import { seshInfoTool } from '@/lib/mcp/seshinfo-tool'
import { seshListTool } from '@/lib/mcp/seshlist-tool'
import { addSleepTool, addNoteTool, logUseTool, moodAddTool, useHistoryTool } from '@/lib/mcp/session-log-tools'
import { createIncidentTool } from '@/lib/mcp/incident-create-tool'
import { lockdownTool } from '@/lib/mcp/lockdown-tool'
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
]

async function routeTool(tool: string, context: Awaited<ReturnType<typeof createMcpContext>>, input?: Record<string, unknown>) {
  if (tool === 'exportincident') return exportIncidentTool(context, input)
  if (tool === 'startsesh') return startSeshTool(context, input)
  if (tool === 'stopsesh') return stopSeshTool(context, input)
  if (tool === 'seshinfo') return seshInfoTool(context)
  if (tool === 'seshlist') return seshListTool(context, input)
  if (tool === 'addsleep') return addSleepTool(context, input)
  if (tool === 'moodadd') return moodAddTool(context, input)
  if (tool === 'addnote') return addNoteTool(context, input)
  if (tool === 'loguse') return logUseTool(context, input)
  if (tool === 'usehistory') return useHistoryTool(context, input)
  if (tool === 'createincident') return createIncidentTool(context, input)
  if (tool === 'lockdown') return lockdownTool(context, input)
  return null
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
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.tool) {
    return NextResponse.json({ ok: false, error: 'Missing MCP tool name' }, { status: 400 })
  }

  const context = await createMcpContext()
  const toolName = body.tool.replace(/^\//, '')
  const routed = await routeTool(toolName, context, body.input)
  const result = routed ?? await runMcpTool(context, { tool: body.tool, input: body.input } as McpToolRequest)

  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
