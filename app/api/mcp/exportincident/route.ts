import { NextResponse } from 'next/server'
import { createMcpContext } from '@/lib/mcp/context'
import { exportIncidentTool } from '@/lib/mcp/exportincident-tool'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  let input: Record<string, unknown> | undefined

  try {
    const body = await request.json()
    input = typeof body?.input === 'object' && body.input !== null ? body.input : body
  } catch {
    input = undefined
  }

  const context = await createMcpContext()
  const result = await exportIncidentTool(context, input)

  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
