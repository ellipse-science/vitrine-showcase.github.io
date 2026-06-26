const ALLOWED_ORIGINS = new Set([
  'https://ellipse-science.github.io',
  'https://vitrinedemocratique.com',
  'http://localhost:3000',
])

const GITHUB_REPO = 'ellipse-science/vitrine-showcase.github.io'

interface Env {
  GITHUB_DISPATCH_TOKEN: string
}

interface ReportPayload {
  event_type: 'report-issue'
  client_payload: {
    description: string
    section?: string
    elementContext?: string
    reporterName?: string
    screenshot?: { name: string; base64: string } | null
  }
}

function isValidPayload(v: unknown): v is ReportPayload {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  if (p['event_type'] !== 'report-issue') return false
  if (typeof p['client_payload'] !== 'object' || p['client_payload'] === null) return false
  const cp = p['client_payload'] as Record<string, unknown>
  if (typeof cp['description'] !== 'string' || cp['description'].trim() === '') return false
  return true
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? ''
    const allowed = ALLOWED_ORIGINS.has(origin)

    const corsHeaders: Record<string, string> = {
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
    if (allowed) corsHeaders['Access-Control-Allow-Origin'] = origin

    // Bloc requêtes sans Origin reconnu (sauf preflight)
    if (!allowed && request.method !== 'OPTIONS') {
      return new Response('Forbidden', { status: 403 })
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders })
    }

    if (!request.headers.get('Content-Type')?.includes('application/json')) {
      return new Response('Unsupported Media Type', { status: 415, headers: corsHeaders })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return new Response('Invalid JSON', { status: 400, headers: corsHeaders })
    }

    if (!isValidPayload(payload)) {
      return new Response('Invalid payload', { status: 422, headers: corsHeaders })
    }

    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'vitrine-worker/1.0',
      },
      body: JSON.stringify(payload),
    })

    return new Response(res.ok ? null : 'GitHub dispatch failed', {
      status: res.ok ? 204 : 502,
      headers: corsHeaders,
    })
  },
}
