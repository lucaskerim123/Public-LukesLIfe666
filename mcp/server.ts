import { loadEnvConfig } from '@next/env'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { createMcpActorContext } from '@/lib/mcp/context'
import { runTrackerCommand } from '@/lib/mcp/commands'
import {
  buildSessionTrackerCommand,
  sessionTrackerInputSchema,
  type SessionTrackerAction,
} from '@/lib/mcp/session-tracker-tool'

loadEnvConfig(process.cwd())

const server = new Server(
  {
    name: 'session-tracker',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'session_tracker',
      description:
        'Control the mental health session tracker from chat: start or stop sessions, add entries, create incidents, and enable lockdown.',
      inputSchema: sessionTrackerInputSchema,
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'session_tracker') {
    throw new Error(`Unknown tool: ${request.params.name}`)
  }

  const args = request.params.arguments ?? {}
  const action = String(args.action ?? '').trim() as SessionTrackerAction
  if (!action) {
    throw new Error('Missing required argument: action')
  }

  const command = buildSessionTrackerCommand(action, args)
  const context = await createMcpActorContext()
  const payload = await runTrackerCommand(context, command)

  return {
    content: [
      {
        type: 'text',
        text: payload.text ?? JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error('MCP server failed to start')
  console.error(error)
  process.exit(1)
})
