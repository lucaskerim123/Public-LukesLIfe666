# `/seshexport` PDF export

Adds a session export flow that reuses the existing Session Tracker report data and gives MCP clients a downloadable PDF-style response.

## MCP command

Tool name: `seshexport`

Accepted names:

- `seshexport`
- `/seshexport`

Optional input:

```json
{
  "session_id": "uuid",
  "session_number": 12,
  "base_url": "https://your-site.com"
}
```

If no session is supplied, the command exports the newest active session first. If there is no active session, it falls back to the latest session.

## Response format

The tool returns:

- `display_text` using the requested user-facing wording.
- `attachment` metadata with PDF name, type, and URL.
- `report_url` for opening the normal report page.
- `download_url` for direct PDF download.
- `fallback_download_url` as the same direct PDF URL.

## PDF route

`GET /api/tracker/[id]/report/pdf`

Returns `application/pdf` with `Content-Disposition: attachment`.

The route uses the same role-aware report data as `/tracker/[id]/report`.
