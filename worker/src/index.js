// Relais vers catalogue.bnf.fr : la BnF coupe les connexions venant des serveurs GitHub.
// Seules les adresses de la BnF sont relayées, et seulement avec le secret partagé.
const ALLOWED_HOST = 'catalogue.bnf.fr'

export default {
  async fetch(request, env) {
    if (request.method !== 'GET') return new Response('method not allowed', { status: 405 })
    if (!env.RELAY_SECRET || request.headers.get('x-relay-secret') !== env.RELAY_SECRET) {
      return new Response('forbidden', { status: 403 })
    }
    const target = new URL(request.url).searchParams.get('url')
    let url
    try {
      url = new URL(target)
    } catch {
      return new Response('bad url', { status: 400 })
    }
    if (url.protocol !== 'https:' || url.hostname !== ALLOWED_HOST) {
      return new Response('host not allowed', { status: 400 })
    }
    let upstream
    try {
      upstream = await fetch(url, { headers: { 'user-agent': 'BDbyNico/1.0' }, redirect: 'manual' })
    } catch {
      // La BnF a coupé la connexion : on le dit clairement au lieu d'une page d'erreur Cloudflare
      return new Response('bnf unreachable', { status: 502 })
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'text/plain' },
    })
  },
}
