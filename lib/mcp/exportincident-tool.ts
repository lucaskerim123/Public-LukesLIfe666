import { can } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getIncidentReportData } from '@/lib/incident-report'
import { incidentLabel, visibleIncidentText } from '@/lib/incidents'
import type { McpContext } from './context'

export interface McpToolResult {
  ok: boolean
  tool: string
  data?: Record<string, unknown>
  error?: string
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function baseUrl(input?: Record<string, unknown>) {
  const supplied = typeof input?.base_url === 'string' ? input.base_url.trim() : ''
  const fallback = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
  return (supplied || fallback).replace(/\/$/, '')
}

function absolute(path: string, base: string) {
  return base ? `${base}${path}` : path
}

function firstString(input: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = input?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function parseIncidentNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const match = value.match(/(?:incident\s*)?#?\s*(\d+)/i)
  return match ? Number(match[1]) : null
}

function parseIncidentId(value: string) {
  const pathMatch = value.match(/\/incidents\/([^/?#\s]+)/i)
  if (pathMatch?.[1]) return pathMatch[1]
  const uuidMatch = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return uuidMatch?.[0] ?? null
}

async function resolveIncidentId(input?: Record<string, unknown>) {
  const suppliedId = firstString(input, ['incident_id', 'id'])
  if (suppliedId) return suppliedId

  const suppliedText = firstString(input, ['link', 'url', 'target', 'query'])
  const idFromText = suppliedText ? parseIncidentId(suppliedText) : null
  if (idFromText) return idFromText

  const number = parseIncidentNumber(input?.incident_number ?? suppliedText)
  const supabase = await createClient()

  if (number !== null && Number.isFinite(number)) {
    const { data, error } = await supabase.from('mental_health_incidents').select('id').eq('incident_number', number).maybeSingle()
    if (error) throw error
    if (data?.id) return data.id as string
  }

  const { data, error } = await supabase.from('mental_health_incidents').select('id').order('occurred_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data?.id ? String(data.id) : null
}

function detailText(report: NonNullable<Awaited<ReturnType<typeof getIncidentReportData>>>) {
  const { incident, role } = report
  return (
    visibleIncidentText(role, incident, 'brief_summary', incident.brief_summary) ||
    visibleIncidentText(role, incident, 'description', incident.description) ||
    visibleIncidentText(role, incident, 'notes', incident.notes) ||
    visibleIncidentText(role, incident, 'outcome', incident.outcome) ||
    'No details recorded.'
  )
}

export async function exportIncidentTool(context: McpContext, input?: Record<string, unknown>): Promise<McpToolResult> {
  if (!context.profile) return { ok: false, tool: 'exportincident', error: 'You must be logged in to export an incident report.' }
  if (!can(context.profile, context.permissions, 'incidents', 'view', context.roleDefaults ?? undefined)) return { ok: false, tool: 'exportincident', error: 'You do not have permission to view incidents.' }

  const incidentId = await resolveIncidentId(input)
  if (!incidentId) return { ok: false, tool: 'exportincident', error: 'No incident found to export.' }

  const report = await getIncidentReportData(incidentId, context.profile.role, context.profile.id)
  if (!report) return { ok: false, tool: 'exportincident', error: 'Incident report not found.' }

  const incident = incidentLabel(report.incident)
  const details = detailText(report)
  const filename = `${safeFilename(incident) || 'incident'}-report.pdf`
  const reportPath = `/incidents/${incidentId}/report`
  const downloadPath = `/api/incidents/${incidentId}/report/pdf`
  const root = baseUrl(input)
  const reportUrl = absolute(reportPath, root)
  const downloadUrl = absolute(downloadPath, root)
  const displayText = [
    'Incident report exported.',
    '',
    `Here\'s what we know about ${incident}.`,
    '',
    `Details: ${details}`,
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
    tool: 'exportincident',
    data: {
      message: 'Incident report exported.',
      display_text: displayText,
      incident,
      incident_id: incidentId,
      details,
      filename,
      mime_type: 'application/pdf',
      attachment: { name: filename, type: 'application/pdf', url: downloadUrl },
      report_url: reportUrl,
      download_url: downloadUrl,
      fallback_download_url: downloadUrl,
    },
  }
}
