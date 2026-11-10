import { describe, expect, it } from 'vitest'

import {
  amazonCoverExists,
  abebooksCoverUrl,
  amazonCoverUrl,
  bnfCoverExists,
  bnfCoverUrl,
  bnfCoverUrls,
  decitreCoverUrl,
  fetchWithRetry,
  findRetailerCover,
} from './covers.mjs'

const answer =
  (bytes, type = 'image/jpeg', ok = true) =>
  async () => ({
    ok,
    headers: { get: () => type },
    arrayBuffer: async () => new ArrayBuffer(bytes),
  })

describe('amazonCoverUrl', () => {
  it("construit l'adresse à partir de l'ISBN-10", () => {
    expect(amazonCoverUrl('9782723452144')).toBe(
      'https://images-na.ssl-images-amazon.com/images/P/272345214X.01.LZZZZZZZ.jpg',
    )
  })

  it('renvoie null pour un ISBN-13 sans équivalent ISBN-10', () => {
    expect(amazonCoverUrl('9791000000000')).toBeNull()
  })
})

describe('amazonCoverExists', () => {
  it('accepte une vraie image', async () => {
    expect(await amazonCoverExists('9782723452144', { fetchFn: answer(5052) })).toBe(true)
  })

  it("refuse l'image vide d'un pixel renvoyée quand Amazon n'a rien", async () => {
    expect(await amazonCoverExists('9782723452144', { fetchFn: answer(43, 'image/gif') })).toBe(
      false,
    )
  })

  it("refuse une réponse en erreur ou qui n'est pas une image", async () => {
    expect(
      await amazonCoverExists('9782723452144', { fetchFn: answer(5000, 'image/jpeg', false) }),
    ).toBe(false)
    expect(await amazonCoverExists('9782723452144', { fetchFn: answer(5000, 'text/html') })).toBe(
      false,
    )
  })
})

describe('couvertures de la BnF', () => {
  const record = (ark, isbn) =>
    `<srw:record><srw:recordData><mxc:record>` +
    `<mxc:controlfield tag="003">http://catalogue.bnf.fr/ark:/12148/${ark}</mxc:controlfield>` +
    `<mxc:datafield tag="010" ind1=" " ind2=" "><mxc:subfield code="a">${isbn}</mxc:subfield></mxc:datafield>` +
    `</mxc:record></srw:recordData></srw:record>`

  it("construit l'adresse du service de couvertures", () => {
    expect(bnfCoverUrl('cb41492610m')).toBe(
      'https://catalogue.bnf.fr/couverture?&appName=NE&idArk=ark:/12148/cb41492610m&couverture=1',
    )
  })

  it('associe chaque ISBN demandé à la notice trouvée, quelle que soit la forme de son ISBN', async () => {
    const xml = `<r>${record('cb41492610m', '978-2-205-06212-0')}${record('cb999999999', '978-2-0000-0000-0')}</r>`
    const fetchFn = async () => ({ ok: true, text: async () => xml })
    const urls = await bnfCoverUrls(['9782205062120'], { fetchFn })
    expect([...urls.keys()]).toEqual(['9782205062120'])
    expect(urls.get('9782205062120')).toBe(bnfCoverUrl('cb41492610m'))
  })

  it('accepte une vraie image et refuse une erreur du service', async () => {
    expect(await bnfCoverExists('u', { fetchFn: answer(60000) })).toBe(true)
    expect(await bnfCoverExists('u', { fetchFn: answer(3770, 'text/html', false) })).toBe(false)
    expect(await bnfCoverExists('u', { fetchFn: answer(100) })).toBe(false)
  })
})

describe('couvertures de libraires', () => {
  it("construit les adresses à partir de l'ISBN-13 (aussi pour les ISBN en 979)", () => {
    expect(decitreCoverUrl('9791033509721')).toBe(
      'https://products-images.di-static.com/image/x/9791033509721-475x500-1.jpg',
    )
    expect(abebooksCoverUrl('9791033509721')).toBe(
      'https://pictures.abebooks.com/isbn/9791033509721-fr-300.jpg',
    )
  })

  it("essaie Decitre puis AbeBooks et s'arrête à la première image", async () => {
    const asked = []
    const fetchFn = async (url) => {
      asked.push(url)
      return url.includes('abebooks')
        ? {
            ok: true,
            headers: { get: () => 'image/jpeg' },
            arrayBuffer: async () => new ArrayBuffer(26000),
          }
        : {
            ok: false,
            headers: { get: () => 'text/html' },
            arrayBuffer: async () => new ArrayBuffer(263),
          }
    }
    expect(await findRetailerCover('9791034768516', { fetchFn })).toBe(
      abebooksCoverUrl('9791034768516'),
    )
    expect(asked).toEqual([decitreCoverUrl('9791034768516'), abebooksCoverUrl('9791034768516')])
  })

  it("renvoie undefined quand aucun libraire n'a l'image", async () => {
    const fetchFn = async () => ({
      ok: false,
      headers: { get: () => 'text/html' },
      arrayBuffer: async () => new ArrayBuffer(0),
    })
    expect(await findRetailerCover('9791034768516', { fetchFn })).toBeUndefined()
  })
})

describe('fetchWithRetry', () => {
  const ok = { ok: true, status: 200 }
  const fast = { attempts: 3, delayMs: 0 }

  it('réessaie après une coupure de connexion puis rend la réponse', async () => {
    let calls = 0
    const fetchFn = async () => {
      calls++
      if (calls < 3) throw new TypeError('fetch failed')
      return ok
    }
    expect(await fetchWithRetry(fetchFn, 'u', {}, fast)).toBe(ok)
    expect(calls).toBe(3)
  })

  it("abandonne avec la dernière erreur après le nombre d'essais prévu", async () => {
    let calls = 0
    const fetchFn = async () => {
      calls++
      throw new TypeError('fetch failed')
    }
    await expect(fetchWithRetry(fetchFn, 'u', {}, fast)).rejects.toThrow('fetch failed')
    expect(calls).toBe(3)
  })

  it("réessaie une réponse 429 ou 5xx, sans jamais dépasser le nombre d'essais", async () => {
    const statuses = [503, 429, 200]
    let calls = 0
    const fetchFn = async () => ({ ok: false, status: statuses[calls++] })
    expect((await fetchWithRetry(fetchFn, 'u', {}, fast)).status).toBe(200)
    let always = 0
    const failing = async () => {
      always++
      return { ok: false, status: 500 }
    }
    expect((await fetchWithRetry(failing, 'u', {}, fast)).status).toBe(500)
    expect(always).toBe(3)
  })

  it('ne réessaie pas une réponse définitive (404, 403)', async () => {
    let calls = 0
    const fetchFn = async () => {
      calls++
      return { ok: false, status: 404 }
    }
    expect((await fetchWithRetry(fetchFn, 'u', {}, fast)).status).toBe(404)
    expect(calls).toBe(1)
  })

  it('les vérifications de couverture en profitent', async () => {
    let calls = 0
    const fetchFn = async () => {
      calls++
      if (calls === 1) throw new TypeError('fetch failed')
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => new ArrayBuffer(60000),
      }
    }
    expect(await bnfCoverExists('u', { fetchFn, retry: fast })).toBe(true)
    expect(calls).toBe(2)
  })
})
