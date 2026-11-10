import { describe, expect, it } from 'vitest'

import {
  amazonCoverExists,
  amazonCoverUrl,
  bnfCoverExists,
  bnfCoverUrl,
  bnfCoverUrls,
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
