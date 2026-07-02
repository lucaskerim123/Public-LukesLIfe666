import { createClient } from '@/lib/supabase/server'
import { incidentLabel } from '@/lib/incidents'
import type { McpContext } from './context'
import { addEvent, canIncidents, currentSession, fail, fmt, inputBool, inputNumber, inputString, needLogin, ok, parseDateTime, type ToolInput, type ToolResult } from './session-shared'

export async function createIncidentTool(context: McpContext, input?: ToolInput): Promise<ToolResult> {
  const login = needLogin(context, 'createincident')
  if (login) return login
  if (!canIncidents(context, 'create')) return fail('createincident', 'You do not have permission to create incidents.')

  const severity = inputNumber(input, 'severity')
  const description = inputString(input, 'description', 'details', 'text')
  if (severity === null || severity < 1 || severity > 10) return fail('createincident', 'Severity must be between 1 and 10.')
  if (!description) return fail('createincident', 'Description is required.')

  const occurredAt = parseDateTime(input?.occurred_at ?? input?.at)
  const substanceUse = inputString(input, 'substance_use') || 'no'
  if (!['no', 'yes', 'comedown'].includes(substanceUse)) return fail('createincident', "substance_use must be 'no', 'yes', or 'comedown'.")

  const linkSession = inputBool(input, 'link_session', true)
  const session = linkSession ? await currentSession(context.profile!.id) : null
  const people = inputString(input, 'people_involved', 'names_involved').split(',').map(v => v.trim()).filter(Boolean)

  const supabase = await createClient()
  const { data, error } = await supabase.from('mental_health_incidents').insert({
    user_id: context.profile!.id,
    occurred_at: occurredAt,
    severity,
    brief_summary: inputString(input, 'brief_summary', 'summary') || null,
    description,
    personal_notes: inputString(input, 'personal_notes') || null,
    notes: inputString(input, 'notes', 'note') || null,
    professional_note: inputString(input, 'professional_note') || null,
    outcome: inputString(input, 'outcome') || null,
    location: inputString(input, 'location') || null,
    substance_use: substanceUse,
    police_called: inputBool(input, 'police_called'),
    ambulance_called: inputBool(input, 'ambulance_called'),
    emergency_services: inputBool(input, 'emergency_services'),
    was_arrested: inputBool(input, 'was_arrested'),
    was_sectioned: inputBool(input, 'was_sectioned'),
    is_sensitive: inputBool(input, 'is_sensitive'),
    tracker_session_id: session?.id ?? null,
    people_involved: people,
    sensitive_fields: [],
    field_visibility: {},
  }).select('*').single()

  if (error) throw error
  if (session?.id) await addEvent(session.id, 'incident_link', 'Incident created', `Linked ${incidentLabel(data)}.`, occurredAt)

  return ok('createincident', ['Incident created.', `Incident: ${incidentLabel(data)}`, `Incident ID: ${data.id}`, `Occurred: ${fmt(occurredAt)}`, `Severity: ${severity}/10`, `Description: ${description}`, `Session link: ${session?.id ?? 'none'}`].join('\n'), { incident_id: data.id, incident: incidentLabel(data) })
}
