import { can } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getTrackerReportData } from '@/lib/tracker-report'
import { sessionLabel } from '@/lib/sessions'
import { startSeshTool, stopSeshTool } from './session-start-stop'
import type { McpContext } from './context'

export type McpToolName = 'health_check' | 'seshexport' | 'startsesh' | 'stopsesh'

export interface McpToolRequest {
  tool: string
  input?: Record<string, unknown>
}

export interface McpToolResult {
  ok: boolean
  tool: string
  data?: Record<string, unknown>
  error?: string
}

type McpToolHandler = (context: McpContext, input?: Record<string, unknown>) => Promise<McpToolResult>

function safeFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normaliseBaseUrl(input?: Record<string, unknown>) {
  const inputBase = typeof input?.base_url === 'string' ? input.base_url.trim() : ''
  const envBase = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  const base = (inputBase || envBase).replace(/\/$/, '')
  return base || ''
}

function absoluteUrl(path: string, baseUrl: string) {
  return baseUrl ? `${baseUrl}${path}` : path
}

async function resolveSessionId(input?: Record<string, unknown>) {
  const suppliedId = typeof input?.session_id === 'string' ? input.session_id.trim() : ''
  if (suppliedId) return suppliedId

  const suppliedNumber = input?.session_number
  const supabase = await createClient()

  if (typeof suppliedNumber === 'number' || typeof suppliedNumber === 'string') {
    const parsed = Number(suppliedNumber)
    if (Number.isFinite(parsed)) {
      const { data, error } = await supabase
        .from('drug_tracker_sessions')
        .select('id')
        .eq('session_number', parsed)
        .maybeSingle()

      if (error) throw error
      if (data?.id) return data.id as string
    }
  }

  const { data: active, error: activeError } = await supabase
    .from('drug_tracker_sessions')
    .select('id')
    .is('date_end', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeError) throw activeError
  if (active?.id) return active.id as string

  const { data: latest, error: latestError } = await supabase
    .from('drug_tracker_sessions')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestError) throw latestError
  return latest?.id ? String(latest.id) : null
}

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

  async seshexport(context, input) {
    if (!context.profile) {
      return {
        ok: false,
        tool: 'seshexport',
        error: 'You must be logged in to export a session report.',
      }
    }

    if (!can(context.profile, context.permissions, 'tracker', 'view', context.roleDefaults ?? undefined)) {
      return {
        ok: false,
        tool: 'seshexport',
        error: 'You do not have permission to view tracker sessions.',
      }
    }

    const sessionId = await resolveSessionId(input)
    if (!sessionId) {
      return {
        ok: false,
        tool: 'seshexport',
        error: 'No tracker session found to export.',
      }
    }

    const reportData = await getTrackerReportData(sessionId, context.profile.role)
    if (!reportData) {
      return {
        ok: false,
        tool: 'seshexport',
        error: 'Session report not found.',
      }
    }

    const sessionName = sessionLabel(reportData.session)
    const filename = `${safeFilename(sessionName) || 'session'}-full-report.pdf`
    const reportPath = `/tracker/${sessionId}/report`
    const downloadPath = `/api/tracker/${sessionId}/report/pdf`
    const baseUrl = normaliseBaseUrl(input)
    const reportUrl = absoluteUrl(reportPath, baseUrl)
    const downloadUrl = absoluteUrl(downloadPath, baseUrl)
    const displayText = [
      'Session report exported.',
      '',
      `Here\'s what we know about ${sessionName}.`,
      '',
      `📎 ${filename}`,
      '',
      '[Download]',
      '',
      'Open report:',
      reportUrl,
      '',
      'Download PDF: (If my systems break)',
      downloadUrl,
    ].join('\n')

    return {
      ok: true,
      tool: 'seshexport',
      data: {
        message: 'Session report exported.',
        display_text: displayText,
        session: sessionName,
        session_id: sessionId,
        filename,
        mime_type: 'application/pdf',
        attachment: {
          name: filename,
          type: 'application/pdf',
          url: downloadUrl,
        },
        report_url: reportUrl,
        download_url: downloadUrl,
        fallback_download_url: downloadUrl,
      },
    }
  },

  startsesh: startSeshTool,
  stopsesh: stopSeshTool,
}

export function listMcpTools(): McpToolName[] {
  return Object.keys(tools) as McpToolName[]
}

export async function runMcpTool(
  context: McpContext,
  request: McpToolRequest
): Promise<McpToolResult> {
  const toolName = request.tool.replace(/^\//, '') as McpToolName
  const handler = tools[toolName]

  if (!handler) {
    return {
      ok: false,
      tool: request.tool,
      error: 'Unknown MCP tool',
    }
  }

  return handler(context, request.input)
}
