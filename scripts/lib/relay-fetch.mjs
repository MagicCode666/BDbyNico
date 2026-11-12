// La BnF coupe les connexions venant des serveurs GitHub : en production (BNF_RELAY_URL défini),
// les requêtes vers catalogue.bnf.fr passent par un relais Cloudflare (dossier worker/). En local,
// et pour tout autre site, on appelle directement.
export function relayFetch(url, options = {}) {
  const relay = process.env.BNF_RELAY_URL
  const secret = process.env.BNF_RELAY_SECRET
  if (!relay || !secret || new URL(url).hostname !== 'catalogue.bnf.fr') return fetch(url, options)
  const target = `${relay}?${new URLSearchParams({ url })}`
  return fetch(target, { ...options, headers: { ...options.headers, 'x-relay-secret': secret } })
}
