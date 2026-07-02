import { logActivity } from '@/lib/activity'
import { DEFAULT_INCIDENT_FIELD_VISIBILITY } from '@/lib/incidents'
import { DEFAULT_SESSION_FIELD_VISIBILITY, sessionLabel } from '@/lib/sessions'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  DrugTrackerSession,
  FieldVisibilityLevel,
  IncidentFieldKey,
  IncidentFieldVisibility,
  SessionFieldVisibility,
  TrackerEntry,
} from '@/lib/supabase/types'
import type { McpActorContext } from './context'
import { assertCan } from './context'

type JsonObject = Record<string, unknown>

type CommandMeta = {
  usage: string
  description: string
}

type CommandResult = {
  command: string
  ok: true
  data: JsonObject
  text?: string
}

type CommandHandler = (context: McpActorContext, rawArgs: string) => Promise<CommandResult>

type ResolvedSession = {
  session: DrugTrackerSession
  requested: string | null
}

const COMMANDS: Record<string, CommandMeta> = {
  '/startsesh': {
    usage: '/startsesh [date=YYYY-MM-DD]',
    description: 'Force starts a new session.',
  },
  '/startcloud': {
    usage: '/startcloud [date=YYYY-MM-DD]',
    description: 'Alias of /startsesh.',
  },
  '/stopsesh': {
    usage: '/stopsesh [confirm=true] [date=YYYY-MM-DD]',
    description: 'Previews session stop; confirm=true closes it.',
  },
  '/stopclould': {
    usage: '/stopclould [confirm=true] [date=YYYY-MM-DD]',
    description: 'Typo alias of /stopsesh.',
  },
  '/seshinfo': {
    usage: '/seshinfo',
    description: 'Shows the current active session.',
  },
  '/seshlist': {
    usage: '/seshlist [count]',
    description: 'Lists recent sessions.',
  },
  '/seshexport': {
    usage: '/seshexport [current|Session #1|<uuid>]',
    description: 'Exports a session with linked records.',
  },
  '/addsleep': {
    usage: '/addsleep 6 | /addsleep hrs=6',
    description: 'Logs sleep hours to the active session.',
  },
  '/moodadd': {
    usage: '/moodadd calm and grounded',
    description: 'Adds a mood entry to the active session.',
  },
  '/addnote': {
    usage: '/addnote your note text',
    description: 'Adds a quick note to the active session.',
  },
  '/loguse': {
    usage: '/loguse ice 0.1 p | /loguse amount=0.1 unit=p notes=...',
    description: 'Logs substance use to the active session.',
  },
  '/usehistory': {
    usage: '/usehistory [current|Session #1|<uuid>]',
    description: 'Shows substance use history for a session.',
  },
  '/createincident': {
    usage: '/createincident severity=5 description=... police_called=true',
    description: 'Creates a structured incident record.',
  },
  '/lockdown': {
    usage: '/lockdown [pin=123456] [message="..."]',
    description: 'Enables site lockdown and optionally sets the emergency PIN or message.',
  },
}

export function listSupportedCommands() {
  return Object.entries(COMMANDS).map(([name, meta]) => ({
    name,
    ...meta,
  }))
}

export async function runTrackerCommand(
  context: McpActorContext,
  commandText: string
): Promise<CommandResult> {
  const text = commandText.trim()
  const normalized = text.startsWith('/') ? text : `/${text}`
  const spaceIndex = normalized.indexOf(' ')
  const command = (spaceIndex === -1 ? normalized : normalized.slice(0, spaceIndex)).toLowerCase()
  const rawArgs = spaceIndex === -1 ? '' : normalized.slice(spaceIndex + 1).trim()

  const handler = handlers[command]
  if (!handler) {
    throw new Error(`Unknown command: ${command}`)
  }

  return handler(context, rawArgs)
}

const handlers: Record<string, CommandHandler> = {
  '/startsesh': handleStartSession,
  '/startcloud': handleStartSession,
  '/stopsesh': handleStopSession,
  '/stopclould': handleStopSession,
  '/seshinfo': handleSessionInfo,
  '/seshlist': handleSessionList,
  '/seshexport': handleSessionExport,
  '/addsleep': handleAddSleep,
  '/moodadd': handleMoodAdd,
  '/addnote': handleAddNote,
  '/loguse': handleLogUse,
  '/usehistory': handleUseHistory,
  '/createincident': handleCreateIncident,
  '/lockdown': handleLockdown,
}

function parseDate(value: string | null | undefined, fallback = false) {
  if (!value) {
    return fallback ? new Date().toISOString().slice(0, 10) : null
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid date: ${value}. Expected YYYY-MM-DD`)
  }
  return value
}

function parseBoolean(value: string | null | undefined, defaultValue = false) {
  if (value == null || value === '') return defaultValue
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`Invalid boolean: ${value}`)
}

function parseNumber(value: string | null | undefined, field: string) {
  const next = Number(value)
  if (!Number.isFinite(next)) {
    throw new Error(`Invalid ${field}: ${value}`)
  }
  return next
}

function parseArgs(rawArgs: string) {
  const tokenPattern = /([^\s=]+)=(".*?"|'.*?'|[^\s]+)/g
  const named: Record<string, string> = {}
  const consumed = new Set<string>()

  for (const match of rawArgs.matchAll(tokenPattern)) {
    const token = match[0]
    const key = match[1].toLowerCase()
    const value = stripQuotes(match[2] ?? '')
    named[key] = value
    consumed.add(token)
  }

  const positional = rawArgs
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !consumed.has(token))
    .map(stripQuotes)

  return { named, positional }
}

function stripQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

async function getActiveSession(context: McpActorContext) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('drug_tracker_sessions')
    .select('*')
    .eq('user_id', context.profile.id)
    .is('date_end', null)
    .order('date_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ?? null
}

async function resolveSession(
  context: McpActorContext,
  rawReference: string | null
): Promise<ResolvedSession> {
  const reference = rawReference?.trim() || null
  const admin = createAdminClient()

  if (!reference || reference.toLowerCase() === 'current') {
    const session = await getActiveSession(context)
    if (!session) throw new Error('No active session found')
    return { session, requested: reference }
  }

  let query = admin.from('drug_tracker_sessions').select('*').eq('user_id', context.profile.id)

  if (/^session\s*#?\d+$/i.test(reference)) {
    const numberText = reference.replace(/[^\d]/g, '')
    query = query.eq('session_number', Number(numberText))
  } else if (/^[0-9a-f-]{36}$/i.test(reference)) {
    query = query.eq('id', reference)
  } else {
    throw new Error(`Unsupported session reference: ${reference}`)
  }

  const { data } = await query.single()
  if (!data) throw new Error(`Session not found: ${reference}`)
  return { session: data, requested: reference }
}

function summarizeSession(session: DrugTrackerSession) {
  return {
    id: session.id,
    session_number: session.session_number,
    label: sessionLabel(session),
    date_start: session.date_start,
    date_end: session.date_end,
    sleep_hours: session.sleep_hours,
    brief_notes: session.brief_notes,
    is_sensitive: session.is_sensitive,
  }
}

function formatSessionRef(session: DrugTrackerSession) {
  return session.session_number != null ? `Session ${session.session_number}` : `Session ${session.id}`
}

async function createSessionEvent(
  sessionId: string,
  eventType: string,
  metadata: JsonObject = {}
) {
  const admin = createAdminClient()
  await admin.from('session_events').insert({
    session_id: sessionId,
    event_type: eventType,
    source: 'mcp',
    metadata,
  })
}

async function handleStartSession(context: McpActorContext, rawArgs: string): Promise<CommandResult> {
  assertCan(context, 'tracker', 'create')
  const { named } = parseArgs(rawArgs)
  const requestedDate = parseDate(named.date, true)!
  const active = await getActiveSession(context)

  const admin = createAdminClient()
  const payload = {
    user_id: context.profile.id,
    date_start: requestedDate,
    date_end: null,
    sleep_hours: 0,
    is_sensitive: false,
    sensitive_fields: [],
    brief_notes: null,
    counsellor_notes: null,
    lawyer_notes: null,
    personal_reflection: null,
    notes: null,
    field_visibility: DEFAULT_SESSION_FIELD_VISIBILITY satisfies SessionFieldVisibility,
  }

  const { data, error } = await admin.from('drug_tracker_sessions').insert(payload).select().single()
  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to start session')
  }

  await createSessionEvent(data.id, 'session_start', {
    forced: true,
    previous_active_session_id: active?.id ?? null,
  })
  await logActivity({
    userId: context.profile.id,
    displayName: context.profile.display_name,
    action: 'mcp_start_session',
    resourceType: 'tracker_session',
    resourceId: data.id,
    metadata: {
      requested_date: requestedDate,
      previous_active_session_id: active?.id ?? null,
    },
  })

  return {
    command: '/startsesh',
    ok: true,
    data: {
      started: summarizeSession(data),
      previous_active_session: active ? summarizeSession(active) : null,
    },
    text: `SESSION STARTED

${formatSessionRef(data)}
Started: ${data.date_start}
Sleep logged: ${data.sleep_hours ?? 0} hrs${
      active ? `\nPrevious active session: ${formatSessionRef(active)}` : ''
    }`,
  }
}

async function handleStopSession(context: McpActorContext, rawArgs: string): Promise<CommandResult> {
  assertCan(context, 'tracker', 'edit')
  const { named } = parseArgs(rawArgs)
  const session = await getActiveSession(context)
  if (!session) throw new Error('No active session found')

  const stopDate = parseDate(named.date, true)!
  const confirm = parseBoolean(named.confirm, false)

  if (!confirm) {
    return {
      command: '/stopsesh',
      ok: true,
      data: {
        preview: true,
        message: 'Add confirm=true to close this session.',
        session: summarizeSession(session),
        proposed_date_end: stopDate,
      },
      text: `SESSION STOP PREVIEW

${formatSessionRef(session)}
Current end date: none
Proposed end date: ${stopDate}

Add confirm=true to close this session.`,
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('drug_tracker_sessions')
    .update({ date_end: stopDate })
    .eq('id', session.id)
    .select()
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to stop session')
  }

  await createSessionEvent(session.id, 'session_stop', { date_end: stopDate })
  await logActivity({
    userId: context.profile.id,
    displayName: context.profile.display_name,
    action: 'mcp_stop_session',
    resourceType: 'tracker_session',
    resourceId: session.id,
    metadata: { date_end: stopDate },
  })

  return {
    command: '/stopsesh',
    ok: true,
    data: {
      stopped: summarizeSession(data),
    },
    text: `SESSION STOPPED

${formatSessionRef(data)}
Started: ${data.date_start}
Ended: ${data.date_end}`,
  }
}

async function handleSessionInfo(context: McpActorContext): Promise<CommandResult> {
  assertCan(context, 'tracker', 'view')
  const session = await getActiveSession(context)
  if (!session) {
    return {
      command: '/seshinfo',
      ok: true,
      data: {
        active_session: null,
        moods: [],
        notes: [],
        incidents: [],
      },
      text: 'SESSION INFO\n\nNo active session running.',
    }
  }

  const admin = createAdminClient()
  const [
    { data: moods },
    { data: notes },
    { data: incidents },
    { data: sleepLog },
    { data: useLog },
    { data: events },
    { data: entries },
  ] = await Promise.all([
    admin
      .from('session_moods')
      .select('*')
      .eq('session_id', session.id)
      .order('occurred_at', { ascending: true }),
    admin
      .from('session_notes')
      .select('*')
      .eq('session_id', session.id)
      .order('occurred_at', { ascending: true }),
    admin
      .from('mental_health_incidents')
      .select('*')
      .eq('tracker_session_id', session.id)
      .order('occurred_at', { ascending: true }),
    admin
      .from('sleep_log')
      .select('*')
      .eq('session_id', session.id)
      .order('logged_at', { ascending: true }),
    admin
      .from('drug_use_log')
      .select('*')
      .eq('session_id', session.id)
      .order('logged_at', { ascending: true }),
    admin
      .from('session_events')
      .select('*')
      .eq('session_id', session.id)
      .order('occurred_at', { ascending: true }),
    admin
      .from('tracker_entries')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true }),
  ])

  const moodText = (moods ?? []).length
    ? (moods ?? [])
        .map(
          (mood, index) =>
            `${index + 1}. mood: ${mood.mood}${mood.notes ? ` ${mood.notes}` : ''}\nTime of Entry: ${mood.occurred_at}\nsource: ${mood.source}`
        )
        .join('\n')
    : 'None'

  const noteText = (notes ?? []).length
    ? (notes ?? [])
        .map((note, index) => {
          const content = note.content || note.note || ''
          return `${index + 1}. note: ${content}\nTime of Entry: ${note.occurred_at}\nsource: ${note.source}`
        })
        .join('\n')
    : 'None'

  const sleepText = (sleepLog ?? []).length
    ? (sleepLog ?? [])
        .map(
          (entry, index) =>
            `${index + 1}. hours: ${entry.hours_added}\nTime of Entry: ${entry.logged_at}\nsource: ${entry.source}`
        )
        .join('\n')
    : 'None'

  const useText = (useLog ?? []).length
    ? (useLog ?? [])
        .map(
          (entry, index) =>
            `${index + 1}. substance: ${entry.substance}${entry.amount != null ? ` ${entry.amount}` : ''}${
              entry.unit ? ` ${entry.unit}` : ''
            }${entry.notes ? `  ${entry.notes}` : ''}\nTime of Entry: ${entry.logged_at}\nsource: ${entry.source}`
        )
        .join('\n')
    : 'None'

  const incidentText = (incidents ?? []).length
    ? (incidents ?? [])
        .map((incident, index) => {
          const label = incident.incident_number ?? incident.id
          return `${index + 1}. Incident #${label} - ${incident.description || 'No description'} - /incidents/${incident.id}`
        })
        .join('\n')
    : 'None'

  const report = `SESSION INFO

Session: ${session.session_number ?? session.id}
Status: ACTIVE
Started: ${session.date_start}      Time: ${session.created_at}
Sleep logged: ${session.sleep_hours ?? 0} hrs

Brief notes: ${session.brief_notes || 'None'}

Sleep Entries:
${sleepText}

Moods Entry:
${moodText}

Notes:
${noteText}

Use history:
${useText}

Incidents linked:
${incidentText}`

  return {
    command: '/seshinfo',
    ok: true,
    data: {
      active_session: summarizeSession(session),
      moods: moods ?? [],
      notes: notes ?? [],
      sleep_log: sleepLog ?? [],
      use_log: useLog ?? [],
      events: events ?? [],
      tracker_entries: entries ?? [],
      incidents: incidents ?? [],
    },
    text: report,
  }
}

async function handleSessionList(context: McpActorContext, rawArgs: string): Promise<CommandResult> {
  assertCan(context, 'tracker', 'view')
  const { positional } = parseArgs(rawArgs)
  const count = positional[0] ? parseNumber(positional[0], 'count') : 5

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('drug_tracker_sessions')
    .select('*')
    .eq('user_id', context.profile.id)
    .order('date_start', { ascending: false })
    .limit(count)

  if (error) throw new Error(error.message)

  return {
    command: '/seshlist',
    ok: true,
    data: {
      count,
      sessions: (data ?? []).map(summarizeSession),
    },
    text: `SESSION LIST

${
      (data ?? []).length
        ? (data ?? [])
            .map(
              (session, index) =>
                `${index + 1}. ${formatSessionRef(session)}  ${session.date_start}${
                  session.date_end ? ` -> ${session.date_end}` : '  ACTIVE'
                }`
            )
            .join('\n')
        : 'No sessions found.'
    }`,
  }
}

async function handleSessionExport(context: McpActorContext, rawArgs: string): Promise<CommandResult> {
  assertCan(context, 'tracker', 'view')
  const reference = rawArgs.trim() || 'current'
  const { session } = await resolveSession(context, reference)
  const admin = createAdminClient()

  const [
    { data: sleepLog },
    { data: useLog },
    { data: moods },
    { data: notes },
    { data: entries },
    { data: events },
    { data: incidents },
  ] = await Promise.all([
    admin.from('sleep_log').select('*').eq('session_id', session.id).order('logged_at', { ascending: false }),
    admin.from('drug_use_log').select('*').eq('session_id', session.id).order('logged_at', { ascending: false }),
    admin.from('session_moods').select('*').eq('session_id', session.id).order('occurred_at', { ascending: false }),
    admin.from('session_notes').select('*').eq('session_id', session.id).order('occurred_at', { ascending: false }),
    admin.from('tracker_entries').select('*').eq('session_id', session.id).order('created_at', { ascending: false }),
    admin.from('session_events').select('*').eq('session_id', session.id).order('occurred_at', { ascending: false }),
    admin.from('mental_health_incidents').select('*').eq('tracker_session_id', session.id).order('occurred_at', { ascending: false }),
  ])

  return {
    command: '/seshexport',
    ok: true,
    data: {
      session: summarizeSession(session),
      sleep_log: sleepLog ?? [],
      use_log: useLog ?? [],
      moods: moods ?? [],
      notes: notes ?? [],
      entries: entries ?? [],
      events: events ?? [],
      incidents: incidents ?? [],
    },
    text: `SESSION EXPORT

${formatSessionRef(session)}
Sleep entries: ${(sleepLog ?? []).length}
Use entries: ${(useLog ?? []).length}
Mood entries: ${(moods ?? []).length}
Notes: ${(notes ?? []).length}
Log entries: ${(entries ?? []).length}
Events: ${(events ?? []).length}
Incidents linked: ${(incidents ?? []).length}`,
  }
}

async function handleAddSleep(context: McpActorContext, rawArgs: string): Promise<CommandResult> {
  assertCan(context, 'tracker', 'edit')
  const { named, positional } = parseArgs(rawArgs)
  const hours = parseNumber(named.hrs ?? positional[0], 'hrs')
  if (hours <= 0) throw new Error('hrs must be greater than 0')

  const session = await getActiveSession(context)
  if (!session) throw new Error('No active session found')

  const admin = createAdminClient()
  const newTotal = Number(session.sleep_hours) + hours
  const [{ error: sleepError }, { data: updatedSession, error: sessionError }] = await Promise.all([
    admin.from('sleep_log').insert({
      session_id: session.id,
      hours_added: hours,
      source: 'mcp',
      entry_type: 'sleep',
      metadata: { command: '/addsleep' },
      visibility: 'counsellor+' satisfies FieldVisibilityLevel,
    }),
    admin.from('drug_tracker_sessions').update({ sleep_hours: newTotal }).eq('id', session.id).select().single(),
  ])

  if (sleepError || sessionError || !updatedSession) {
    throw new Error(sleepError?.message ?? sessionError?.message ?? 'Failed to add sleep')
  }

  await createSessionEvent(session.id, 'sleep', { hours_added: hours })

  return {
    command: '/addsleep',
    ok: true,
    data: {
      session: summarizeSession(updatedSession),
      hours_added: hours,
      sleep_hours_total: updatedSession.sleep_hours,
    },
    text: `SLEEP LOGGED

${formatSessionRef(updatedSession)}
Added: ${hours} hrs
Total sleep logged: ${updatedSession.sleep_hours} hrs`,
  }
}

async function handleMoodAdd(context: McpActorContext, rawArgs: string): Promise<CommandResult> {
  assertCan(context, 'tracker', 'edit')
  const text = rawArgs.trim()
  if (!text) throw new Error('Mood text is required')

  const session = await getActiveSession(context)
  if (!session) throw new Error('No active session found')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('session_moods')
    .insert({
      session_id: session.id,
      mood: text,
      notes: null,
      source: 'mcp',
      entry_type: 'mood',
      metadata: { command: '/moodadd' },
      visibility: 'viewer+' satisfies FieldVisibilityLevel,
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to add mood')
  }

  await createSessionEvent(session.id, 'mood', { mood: text })

  return {
    command: '/moodadd',
    ok: true,
    data: {
      session: summarizeSession(session),
      mood: data,
    },
    text: `MOOD ADDED

${formatSessionRef(session)}
${data.mood}${data.notes ? `  ${data.notes}` : ''}`,
  }
}

async function handleAddNote(context: McpActorContext, rawArgs: string): Promise<CommandResult> {
  assertCan(context, 'tracker', 'edit')
  const text = rawArgs.trim()
  if (!text) throw new Error('Note text is required')

  const session = await getActiveSession(context)
  if (!session) throw new Error('No active session found')

  const admin = createAdminClient()
  const visibility = DEFAULT_SESSION_FIELD_VISIBILITY.notes
  const { data, error } = await admin
    .from('session_notes')
    .insert({
      session_id: session.id,
      note: text,
      content: text,
      entry_type: 'note',
      source: 'mcp',
      metadata: { command: '/addnote' },
      visibility,
      is_sensitive: visibility !== 'viewer+',
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to add note')
  }

  await createSessionEvent(session.id, 'note', { visibility })

  return {
    command: '/addnote',
    ok: true,
    data: {
      session: summarizeSession(session),
      note: data,
    },
    text: `NOTE ADDED

${formatSessionRef(session)}
${data.content}`,
  }
}

async function handleLogUse(context: McpActorContext, rawArgs: string): Promise<CommandResult> {
  assertCan(context, 'tracker', 'edit')
  const { named, positional } = parseArgs(rawArgs)
  const substance = (named.substance ?? positional[0] ?? 'ice').trim()
  const amountToken = named.amount ?? positional[1]
  const unit = (named.unit ?? positional[2] ?? '').trim() || null
  const notes = [named.notes, ...positional.slice(3)].filter(Boolean).join(' ').trim() || null
  const amount = amountToken ? parseNumber(amountToken, 'amount') : null

  const session = await getActiveSession(context)
  if (!session) throw new Error('No active session found')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('drug_use_log')
    .insert({
      session_id: session.id,
      substance,
      amount,
      unit,
      notes,
      source: 'mcp',
      entry_type: 'usage',
      metadata: { command: '/loguse' },
      visibility: DEFAULT_SESSION_FIELD_VISIBILITY.usage_log,
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to log use')
  }

  await createSessionEvent(session.id, 'usage', { substance, amount, unit })

  return {
    command: '/loguse',
    ok: true,
    data: {
      session: summarizeSession(session),
      usage: data,
    },
    text: `USE LOGGED

${formatSessionRef(session)}
Substance: ${data.substance}
Amount: ${data.amount ?? 'unknown'}${data.unit ? ` ${data.unit}` : ''}
${data.notes ? `Notes: ${data.notes}` : ''}`,
  }
}

async function handleUseHistory(context: McpActorContext, rawArgs: string): Promise<CommandResult> {
  assertCan(context, 'tracker', 'view')
  const reference = rawArgs.trim() || 'current'
  const { session } = await resolveSession(context, reference)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('drug_use_log')
    .select('*')
    .eq('session_id', session.id)
    .order('logged_at', { ascending: false })

  if (error) throw new Error(error.message)

  return {
    command: '/usehistory',
    ok: true,
    data: {
      session: summarizeSession(session),
      entries: data ?? [],
    },
    text: `USE HISTORY

${formatSessionRef(session)}

${
      (data ?? []).length
        ? (data ?? [])
            .map(
              (entry, index) =>
                `${index + 1}. ${entry.substance}${entry.amount != null ? ` ${entry.amount}` : ''}${
                  entry.unit ? ` ${entry.unit}` : ''
                }${entry.notes ? `  ${entry.notes}` : ''}`
            )
            .join('\n')
        : 'None'
    }`,
  }
}

async function handleCreateIncident(context: McpActorContext, rawArgs: string): Promise<CommandResult> {
  assertCan(context, 'incidents', 'create')
  const { named } = parseArgs(rawArgs)
  if (!named.description?.trim()) {
    throw new Error('description is required')
  }

  const severity = parseNumber(named.severity ?? '5', 'severity')
  if (severity < 1 || severity > 10) {
    throw new Error('severity must be between 1 and 10')
  }

  const occurredAt = named.occurred_at?.trim()
    ? new Date(named.occurred_at).toISOString()
    : new Date().toISOString()

  const activeSession = named.tracker_session_id
    ? (await resolveSession(context, named.tracker_session_id)).session
    : await getActiveSession(context)

  const fieldVisibility: IncidentFieldVisibility = {
    ...DEFAULT_INCIDENT_FIELD_VISIBILITY,
  }

  const sensitiveFields = parseCsv(named.sensitive_fields).filter(isIncidentFieldKey)
  for (const field of sensitiveFields) {
    fieldVisibility[field] = 'counsellor+'
  }

  const payload = {
    user_id: context.profile.id,
    occurred_at: occurredAt,
    severity,
    brief_summary: named.brief_summary?.trim() || null,
    description: named.description.trim(),
    location: named.location?.trim() || null,
    personal_notes: named.personal_notes?.trim() || null,
    notes: named.notes?.trim() || null,
    professional_note: named.professional_note?.trim() || null,
    outcome: named.outcome?.trim() || null,
    substance_use: normalizeSubstanceUse(named.substance_use),
    police_called: parseBoolean(named.police_called, false),
    was_arrested: parseBoolean(named.was_arrested, false),
    ambulance_called: parseBoolean(named.ambulance_called, false),
    was_sectioned: parseBoolean(named.was_sectioned, false),
    is_sensitive: parseBoolean(named.is_sensitive, false),
    tracker_session_id: activeSession?.id ?? null,
    people_involved: parseCsv(named.people_involved),
    sensitive_fields: sensitiveFields,
    field_visibility: fieldVisibility,
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('mental_health_incidents')
    .insert(payload)
    .select()
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create incident')
  }

  if (activeSession) {
    await createSessionEvent(activeSession.id, 'incident_link', { incident_id: data.id })
  }

  await logActivity({
    userId: context.profile.id,
    displayName: context.profile.display_name,
    action: 'mcp_create_incident',
    resourceType: 'incident',
    resourceId: data.id,
    metadata: {
      severity,
      tracker_session_id: payload.tracker_session_id,
    },
  })

  return {
    command: '/createincident',
    ok: true,
    data: {
      incident: data,
    },
    text: `INCIDENT CREATED

Incident #${data.incident_number ?? data.id}
Severity: ${data.severity}
Occurred: ${data.occurred_at}
Description: ${data.description}`,
  }
}

function parseCsv(value: string | null | undefined) {
  return (value ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}

function normalizeSubstanceUse(value: string | null | undefined) {
  const normalized = (value ?? 'no').trim().toLowerCase()
  if (normalized === 'no' || normalized === 'yes' || normalized === 'comedown') {
    return normalized
  }
  throw new Error(`Invalid substance_use: ${value}`)
}

function isIncidentFieldKey(value: string): value is IncidentFieldKey {
  return [
    'brief_summary',
    'description',
    'notes',
    'personal_notes',
    'professional_note',
    'location',
    'people_involved',
    'outcome',
  ].includes(value)
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function handleLockdown(context: McpActorContext, rawArgs: string): Promise<CommandResult> {
  assertCan(context, 'admin_lockdown', 'view')
  const { named } = parseArgs(rawArgs)
  const pin = named.pin?.trim() || null
  const message = named.message?.trim() || null
  const title = named.title?.trim() || null

  if (pin && pin.length < 6) {
    throw new Error('PIN must be at least 6 characters')
  }

  const admin = createAdminClient()
  const { data: existingPin } = await admin
    .from('site_config')
    .select('value')
    .eq('key', 'lockdown_pin_hash')
    .maybeSingle()

  if (!pin && !existingPin?.value) {
    throw new Error('A lockdown PIN must already exist, or supply pin=... when enabling lockdown')
  }

  const updates: Array<{ key: string; value: string | null; updated_by: string; updated_at: string }> = []
  const updatedAt = new Date().toISOString()

  if (pin) {
    updates.push({
      key: 'lockdown_pin_hash',
      value: await sha256(pin),
      updated_by: context.profile.id,
      updated_at: updatedAt,
    })
  }

  if (message) {
    updates.push({
      key: 'lockdown_message',
      value: message,
      updated_by: context.profile.id,
      updated_at: updatedAt,
    })
  }

  if (title) {
    updates.push({
      key: 'lockdown_title',
      value: title,
      updated_by: context.profile.id,
      updated_at: updatedAt,
    })
  }

  updates.push({
    key: 'lockdown_mode',
    value: 'true',
    updated_by: context.profile.id,
    updated_at: updatedAt,
  })

  const { error } = await admin.from('site_config').upsert(updates)
  if (error) {
    throw new Error(error.message)
  }

  await logActivity({
    userId: context.profile.id,
    displayName: context.profile.display_name,
    action: 'lockdown_enable',
    metadata: {
      via: 'mcp',
      pin_updated: Boolean(pin),
      message_updated: Boolean(message),
    },
  })

  return {
    command: '/lockdown',
    ok: true,
    data: {
      lockdown_enabled: true,
      pin_updated: Boolean(pin),
      title_updated: Boolean(title),
      message_updated: Boolean(message),
    },
    text: `LOCKDOWN ENABLED

PIN configured: yes
PIN updated: ${pin ? 'yes' : 'no'}
Title updated: ${title ? 'yes' : 'no'}
Message updated: ${message ? 'yes' : 'no'}`,
  }
}
