export type SessionTrackerAction =
  | 'start_session'
  | 'stop_session'
  | 'session_info'
  | 'session_list'
  | 'session_export'
  | 'add_sleep'
  | 'add_mood'
  | 'add_note'
  | 'log_use'
  | 'use_history'
  | 'create_incident'
  | 'lockdown'

export const SESSION_TRACKER_ACTIONS: SessionTrackerAction[] = [
  'start_session',
  'stop_session',
  'session_info',
  'session_list',
  'session_export',
  'add_sleep',
  'add_mood',
  'add_note',
  'log_use',
  'use_history',
  'create_incident',
  'lockdown',
]

export const sessionTrackerInputSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: SESSION_TRACKER_ACTIONS,
      description: 'The session tracker action to perform.',
    },
    date: {
      type: 'string',
      description: 'Optional date in YYYY-MM-DD format for start or stop actions.',
    },
    confirm: {
      type: 'boolean',
      description: 'Set true to confirm stop_session or to actually enable lockdown.',
    },
    count: {
      type: 'number',
      description: 'How many sessions to list.',
    },
    session: {
      type: 'string',
      description: 'Session reference such as current, Session #1, or a UUID.',
    },
    hours: {
      type: 'number',
      description: 'Hours to add for add_sleep.',
    },
    text: {
      type: 'string',
      description: 'Main text body for add_mood or add_note.',
    },
    substance: {
      type: 'string',
      description: 'Substance name for log_use.',
    },
    amount: {
      type: 'number',
      description: 'Amount for log_use.',
    },
    unit: {
      type: 'string',
      description: 'Unit for log_use.',
    },
    notes: {
      type: 'string',
      description: 'Additional notes for log_use or create_incident.',
    },
    severity: {
      type: 'number',
      description: 'Severity from 1 to 10 for create_incident.',
    },
    description: {
      type: 'string',
      description: 'Required incident description for create_incident.',
    },
    brief_summary: {
      type: 'string',
      description: 'Optional brief summary for create_incident.',
    },
    occurred_at: {
      type: 'string',
      description: 'Optional ISO timestamp for create_incident.',
    },
    location: {
      type: 'string',
      description: 'Optional location for create_incident.',
    },
    personal_notes: {
      type: 'string',
      description: 'Optional personal notes for create_incident.',
    },
    professional_note: {
      type: 'string',
      description: 'Optional professional note for create_incident.',
    },
    outcome: {
      type: 'string',
      description: 'Optional outcome for create_incident.',
    },
    substance_use: {
      type: 'string',
      enum: ['no', 'yes', 'comedown'],
      description: 'Substance use status for create_incident.',
    },
    police_called: {
      type: 'boolean',
      description: 'Whether police were called for create_incident.',
    },
    was_arrested: {
      type: 'boolean',
      description: 'Whether an arrest happened for create_incident.',
    },
    ambulance_called: {
      type: 'boolean',
      description: 'Whether an ambulance was called for create_incident.',
    },
    was_sectioned: {
      type: 'boolean',
      description: 'Whether sectioning occurred for create_incident.',
    },
    is_sensitive: {
      type: 'boolean',
      description: 'Marks the incident as sensitive.',
    },
    tracker_session_id: {
      type: 'string',
      description: 'Optional session reference to link an incident to.',
    },
    people_involved: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional list of people involved for create_incident.',
    },
    sensitive_fields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional list of incident fields to treat as sensitive.',
    },
    pin: {
      type: 'string',
      description: 'Optional emergency PIN to set while enabling lockdown.',
    },
    message: {
      type: 'string',
      description: 'Optional lockdown message to save while enabling lockdown.',
    },
    title: {
      type: 'string',
      description: 'Optional lockdown title or reason to display on the lock screen.',
    },
  },
  required: ['action'],
  additionalProperties: false,
} as const

export function buildSessionTrackerCommand(
  action: SessionTrackerAction,
  args: Record<string, unknown>
) {
  switch (action) {
    case 'start_session':
      return buildNamedCommand('/startsesh', [['date', args.date]])
    case 'stop_session':
      return buildNamedCommand('/stopsesh', [
        ['confirm', args.confirm],
        ['date', args.date],
      ])
    case 'session_info':
      return '/seshinfo'
    case 'session_list':
      return args.count == null ? '/seshlist' : `/seshlist ${String(args.count)}`
    case 'session_export':
      return buildPositionalCommand('/seshexport', [args.session])
    case 'add_sleep':
      return buildNamedCommand('/addsleep', [['hrs', args.hours]])
    case 'add_mood':
      return buildPositionalCommand('/moodadd', [args.text], true)
    case 'add_note':
      return buildPositionalCommand('/addnote', [args.text], true)
    case 'log_use':
      return buildNamedCommand('/loguse', [
        ['substance', args.substance],
        ['amount', args.amount],
        ['unit', args.unit],
        ['notes', args.notes],
      ])
    case 'use_history':
      return buildPositionalCommand('/usehistory', [args.session])
    case 'create_incident':
      return buildNamedCommand('/createincident', [
        ['severity', args.severity],
        ['description', args.description],
        ['brief_summary', args.brief_summary],
        ['occurred_at', args.occurred_at],
        ['location', args.location],
        ['personal_notes', args.personal_notes],
        ['notes', args.notes],
        ['professional_note', args.professional_note],
        ['outcome', args.outcome],
        ['substance_use', args.substance_use],
        ['police_called', args.police_called],
        ['was_arrested', args.was_arrested],
        ['ambulance_called', args.ambulance_called],
        ['was_sectioned', args.was_sectioned],
        ['is_sensitive', args.is_sensitive],
        ['tracker_session_id', args.tracker_session_id],
        ['people_involved', joinList(args.people_involved)],
        ['sensitive_fields', joinList(args.sensitive_fields)],
      ])
    case 'lockdown':
      return buildNamedCommand('/lockdown', [
        ['pin', args.pin],
        ['title', args.title],
        ['message', args.message],
      ])
    default:
      throw new Error(`Unsupported action: ${action}`)
  }
}

function buildNamedCommand(
  command: string,
  entries: Array<[key: string, value: unknown]>
) {
  const parts = entries
    .filter(([, value]) => value != null && value !== '')
    .map(([key, value]) => `${key}=${quoteArg(String(value))}`)

  return parts.length > 0 ? `${command} ${parts.join(' ')}` : command
}

function buildPositionalCommand(command: string, values: unknown[], required = false) {
  const parts = values
    .filter(value => value != null && value !== '')
    .map(value => quoteArg(String(value)))

  if (required && parts.length === 0) {
    throw new Error(`${command} requires text input`)
  }

  return parts.length > 0 ? `${command} ${parts.join(' ')}` : command
}

function joinList(value: unknown) {
  return Array.isArray(value) ? value.map(item => String(item)).join(',') : value
}

function quoteArg(value: string) {
  return /[\s"]/u.test(value) ? JSON.stringify(value) : value
}
