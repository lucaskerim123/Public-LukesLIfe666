Session export PDF notes.

The MCP tool is seshexport. It also accepts /seshexport because the tool registry strips a leading slash before lookup.

The command exports the newest active session when no session_id or session_number is supplied. If no session is active, it falls back to the latest session.

The response includes display_text, attachment metadata, report_url, download_url, and fallback_download_url.

The direct PDF route is GET /api/tracker/[id]/report/pdf and returns application/pdf with Content-Disposition attachment.
