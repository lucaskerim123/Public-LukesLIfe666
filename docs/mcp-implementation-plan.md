# MCP Implementation Plan

Branch: `mcp_creation`
Base branch: `main`

## Safety rules

- Work only on `mcp_creation` until the MCP implementation builds cleanly.
- Do not merge directly into `main`.
- Do not expose raw database access.
- Do not add delete tools in the first MCP version.
- Do not expose Supabase service-role credentials to client-side code.
- Reuse the existing authentication and permission helpers.
- Add one MCP tool at a time and test after each step.

## Phase 1: Safe MCP shell

Status: started.

Files:

- `lib/mcp/context.ts`
- `lib/mcp/tool-registry.ts`
- `app/api/mcp/route.ts`

Current tool:

- `health_check`

Purpose:

- Confirm the MCP route is alive.
- Confirm whether the request is authenticated.
- Confirm the authenticated user's role without exposing private data.

## Phase 2: Read-only tracker tools

Add only after Phase 1 builds cleanly.

Planned tools:

- `get_current_user_profile`
- `list_tracker_sessions`
- `get_session_summary`

Rules:

- Require an authenticated user.
- Use existing role/resource/action permission checks.
- Return minimal fields first.

## Phase 3: Controlled write tools

Add only after read-only tools build and behave correctly.

Planned tools:

- `create_session_note`
- `create_incident_draft`

Rules:

- Require authenticated user.
- Require `tracker:create` or `incidents:create` permission.
- Validate body shape before writing.
- Never allow destructive actions.

## Phase 4: PR

Open a PR from `mcp_creation` into `main` only after build/testing passes.
