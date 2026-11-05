export function planHtml(publicUrl: string): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8" /><title>mcp-toolbox — plan</title></head>
<body style="font-family: sans-serif; max-width: 40rem; margin: 3rem auto; line-height: 1.5;">
  <h1>mcp-toolbox</h1>
  <p>A remote MCP server with four tools, reachable at <code>${publicUrl}/mcp</code>.</p>

  <h2>Tools</h2>
  <ul>
    <li><strong>memo_write</strong> — saves a note. Input: <code>{ text }</code>. Result: <code>{ id }</code>.</li>
    <li><strong>memo_search</strong> — finds notes whose text contains a query. Input: <code>{ query }</code>. Result: <code>{ notes: [{ id, text, createdAt }] }</code>.</li>
    <li><strong>upload</strong> — stores a file and returns a public link. Input: <code>{ filename, contentBase64 }</code>. Result: <code>{ url }</code>.</li>
    <li><strong>transcribe</strong> — turns audio at a URL into timestamped text (via Groq Whisper). Input: <code>{ url }</code>. Result: <code>{ segments: [{ start, text }] }</code>.</li>
  </ul>

  <h2>Sign-in</h2>
  <p>
    This server uses OAuth 2.1 with PKCE and dynamic client registration. Any client may
    register itself, but every new client must be approved by the owner on an
    <code>/authorize</code> page before it receives an access token. Approval requires a secret
    owner code known only to the operator.
  </p>

  <h2>Data kept</h2>
  <ul>
    <li>Notes written with <code>memo_write</code> are kept indefinitely, as plain text, until deleted by the operator.</li>
    <li>Uploaded files are kept on the server's disk and served back at a public link; they are not scanned or transformed.</li>
    <li>Transcription audio is sent to Groq's API for processing and is not stored by this server beyond the request.</li>
    <li>Issued OAuth access tokens are stored so clients stay authorized across server restarts; there is no token expiry or revocation UI yet.</li>
  </ul>
</body>
</html>`;
}
