const ALLOWED_ORIGINS = [
  'https://ellipse-science.github.io',
  'https://vitrinedemocratique.com',
  'http://localhost:3000',
]

const GITHUB_REPO = 'ellipse-science/vitrine-showcase.github.io'

interface Env {
  GITHUB_DISPATCH_TOKEN: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? ''
    const corsOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]

    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return new Response('Invalid JSON', { status: 400, headers: corsHeaders })
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
