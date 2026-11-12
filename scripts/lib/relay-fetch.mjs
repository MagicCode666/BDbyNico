// La BnF coupe les connexions venant des serveurs GitHub : en production (BNF_RELAY_URL défini),
// les requêtes vers catalogue.bnf.fr passent par un relais Cloudflare (dossier worker/). En local,
// et pour tout autre site, on appelle directement.
export function relayFetch(url, options = {}) {
  const relay = process.env.BNF_RELAY_URL
  const secret = process.env.BNF_RELAY_SECRET
  if (!relay || !secret || new URL(url).hostname !== 'catalogue.bnf.fr') return fetch(url, options)
  const target = `${relay}?${new URLSearchParams({ url })}`
  // new Headers accepte un objet, une liste de paires ou un Headers existant
  const headers = new Headers(options.headers)
  headers.set('x-relay-secret', secret)
  return fetch(target, { ...options, headers })
}
