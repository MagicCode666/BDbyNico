import { describe, expect, it } from 'vitest'

import { buildSeriesView, missingVolumes, type CatalogueEdition, type UserItem } from './buildView'
import { completionLabel } from './status'

const edition = (
  volume: number | null,
  extra: Partial<CatalogueEdition> = {},
): CatalogueEdition => ({
  isbn: `isbn-${volume ?? 'x'}-${extra.title ?? ''}`,
  title: `Tome ${volume ?? 'sans numéro'}`,
  volume,
  coverUrl: null,
  authors: [],
  ...extra,
})

const item = (ed: CatalogueEdition, status: 'owned' | 'wanted' = 'owned'): UserItem => ({
  id: `item-${ed.isbn}`,
  isbn: ed.isbn,
  status,
  read: false,
})

describe('missingVolumes', () => {
  it('liste les tomes de 1 au total absents des possédés et des ignorés', () => {
    expect(missingVolumes(6, [1, 2, 4], [5])).toEqual([3, 6])
  })
  it('renvoie une liste vide sans total ou quand tout est là', () => {
    expect(missingVolumes(null, [1], [])).toEqual([])
    expect(missingVolumes(3, [1, 2, 3], [])).toEqual([])
  })
})

describe('buildSeriesView', () => {
  const e1 = edition(1)
  const e2 = edition(2)
  const e3 = edition(3)
  const e4 = edition(4)
  const base = {
    editions: [e1, e2, e3, e4],
    items: [item(e1), item(e2, 'wanted')],
    ignored: [],
    override: null,
  }

  it('classe chaque tome : possédé, envie, manquant', () => {
    const view = buildSeriesView({ ...base, total: 4 })
    expect(view.slots.map((s) => s.kind)).toEqual(['owned', 'wanted', 'missing', 'missing'])
    expect(view.ownedCount).toBe(1)
    expect(view.targetCount).toBe(4)
    expect(view.missing).toEqual([2, 3, 4])
    expect(view.complete).toBe(false)
  })

  it('marque « inconnu » un tome absent du catalogue', () => {
    const view = buildSeriesView({ ...base, editions: [e1], items: [item(e1)], total: 3 })
    expect(view.slots.map((s) => s.kind)).toEqual(['owned', 'unknown', 'unknown'])
  })

  it('met de côté les tomes ignorés et les retire de la cible', () => {
    const view = buildSeriesView({ ...base, total: 4, ignored: [3, 4] })
    expect(view.slots.map((s) => s.kind)).toEqual(['owned', 'wanted', 'ignored', 'ignored'])
    expect(view.targetCount).toBe(2)
    expect(view.missing).toEqual([2])
  })

  it("un tome possédé reste visible même s'il est ignoré", () => {
    const view = buildSeriesView({ ...base, total: 4, ignored: [1] })
    expect(view.slots[0].kind).toBe('owned')
    expect(view.targetCount).toBe(4)
  })

  it('déclare la série complète quand tous les tomes cibles sont possédés', () => {
    const view = buildSeriesView({
      ...base,
      items: [item(e1), item(e2), item(e3)],
      total: 4,
      ignored: [4],
    })
    expect(view.complete).toBe(true)
    expect(view.missing).toEqual([])
  })

  it("le total personnel l'emporte sur le total partagé", () => {
    const view = buildSeriesView({ ...base, total: 4, override: 2 })
    expect(view.total).toBe(4) // les tomes 3 et 4 existent dans le catalogue : la grille ne les cache pas
    const small = buildSeriesView({ ...base, editions: [e1, e2], total: 4, override: 2 })
    expect(small.total).toBe(2)
    expect(small.totalIsEstimate).toBe(false)
  })

  it('étend la grille au plus grand tome connu et signale un total estimé', () => {
    const view = buildSeriesView({ ...base, total: null })
    expect(view.total).toBe(4)
    expect(view.totalIsEstimate).toBe(true)
  })

  it('préfère « possédé » à « envie » pour un même tome', () => {
    const other = edition(1, { title: 'autre édition' })
    const view = buildSeriesView({
      ...base,
      editions: [e1, other],
      items: [item(e1, 'wanted'), item(other, 'owned')],
      total: 1,
    })
    expect(view.slots[0].kind).toBe('owned')
  })

  it('range à part les albums sans numéro', () => {
    const special = edition(null)
    const view = buildSeriesView({
      ...base,
      editions: [e1, special],
      items: [item(special)],
      total: 1,
    })
    expect(view.unnumbered).toHaveLength(1)
    expect(view.unnumbered[0].item?.status).toBe('owned')
  })

  it("préfère, pour un tome manquant, l'édition qui a une couverture", () => {
    const bare = edition(2)
    const withCover = edition(2, { title: 'avec couverture', coverUrl: 'https://x/y.jpg' })
    const view = buildSeriesView({ ...base, editions: [bare, withCover], items: [], total: 2 })
    const slot = view.slots[1]
    expect(slot.kind === 'missing' && slot.edition.coverUrl).toBe('https://x/y.jpg')
  })
})

describe('tome 0 (prologue)', () => {
  const e0 = edition(0)
  const e1 = edition(1)
  const e2 = edition(2)

  it("donne une case au tome 0 quand l'utilisateur le possède", () => {
    const view = buildSeriesView({
      total: 2,
      override: null,
      editions: [e0, e1, e2],
      items: [item(e0), item(e1), item(e2)],
      ignored: [],
    })
    expect(view.slots.map((s) => s.volume)).toEqual([0, 1, 2])
    expect(view.ownedCount).toBe(3)
    expect(view.targetCount).toBe(3)
    expect(view.complete).toBe(true)
  })

  it("ne réclame pas le tome 0 qu'on n'a pas : il est proposé à part", () => {
    const view = buildSeriesView({
      total: 2,
      override: null,
      editions: [e0, e1, e2],
      items: [item(e1), item(e2)],
      ignored: [],
    })
    expect(view.slots.map((s) => s.volume)).toEqual([1, 2])
    expect(view.complete).toBe(true)
    expect(view.unnumbered.map((u) => u.edition.volume)).toEqual([0])
  })

  it('un tome 0 possédé ne fait pas dépasser le total', () => {
    const view = buildSeriesView({
      total: 2,
      override: null,
      editions: [e0, e1, e2],
      items: [item(e0), item(e1)],
      ignored: [],
    })
    expect(view.total).toBe(2)
    expect(view.missing).toEqual([2])
  })
})

describe('completionLabel', () => {
  it('ne dit « Complète » que pour une série terminée', () => {
    expect(completionLabel(true, 'finished')).toBe('Complète')
  })

  it('dit « À jour » pour une série en cours ou au statut inconnu', () => {
    expect(completionLabel(true, 'ongoing')).toBe('À jour')
    expect(completionLabel(true, null)).toBe('À jour')
    expect(completionLabel(true, undefined)).toBe('À jour')
  })

  it("n'affiche rien tant que des tomes manquent", () => {
    expect(completionLabel(false, 'finished')).toBeNull()
  })
})

describe('intégrales et hors-séries', () => {
  const e1 = edition(1)
  const e2 = edition(2)
  const e3 = edition(3)
  const integral = edition(null, {
    isbn: 'integrale-1-3',
    title: 'La trilogie',
    kind: 'integral',
    volumeFrom: 1,
    volumeTo: 3,
  })
  const partial = edition(null, {
    isbn: 'integrale-4-6',
    title: 'Deuxième cycle',
    kind: 'integral',
    volumeFrom: 4,
    volumeTo: 6,
  })
  const special = edition(null, { isbn: 'hs', title: 'Hors-série', kind: 'special' })

  it("n'accorde aucune case à une intégrale : elle est listée à part, avec son état", () => {
    const view = buildSeriesView({
      total: 3,
      override: null,
      editions: [e1, e2, e3, integral],
      items: [item(integral)],
      ignored: [],
    })
    expect(view.slots.map((s) => s.kind)).toEqual(['missing', 'missing', 'missing'])
    expect(view.ownedCount).toBe(0)
    expect(view.integrals).toHaveLength(1)
    expect(view.integrals[0].item?.status).toBe('owned')
    expect(view.unnumbered).toHaveLength(0)
  })

  it("possède l'intégrale, exclut les trois tomes : la série est complète pour soi", () => {
    const view = buildSeriesView({
      total: 3,
      override: null,
      editions: [e1, e2, e3, integral],
      items: [item(integral)],
      ignored: [1, 2, 3],
    })
    expect(view.targetCount).toBe(0)
    expect(view.complete).toBe(true)
  })

  it('sans intégrale ni tome, tout exclure ne rend pas la série complète', () => {
    const view = buildSeriesView({
      total: 3,
      override: null,
      editions: [e1, e2, e3, integral],
      items: [],
      ignored: [1, 2, 3],
    })
    expect(view.complete).toBe(false)
  })

  it("liste plusieurs intégrales partielles dans l'ordre des tomes repris", () => {
    const view = buildSeriesView({
      total: 6,
      override: null,
      editions: [e1, e2, e3, partial, special, integral],
      items: [item(partial), item(integral, 'wanted')],
      ignored: [],
    })
    expect(view.integrals.map((entry) => entry.edition.title)).toEqual([
      'Hors-série',
      'La trilogie',
      'Deuxième cycle',
    ])
    expect(view.integrals.map((entry) => entry.item?.status ?? null)).toEqual([
      null,
      'wanted',
      'owned',
    ])
  })

  it("le numéro d'une intégrale numérotée n'élargit pas le total de la série", () => {
    const numbered = edition(23, {
      isbn: 'integrale-23',
      title: 'Intégrale n° 23',
      kind: 'integral',
    })
    const view = buildSeriesView({
      total: 3,
      override: null,
      editions: [e1, e2, e3, numbered],
      items: [item(numbered)],
      ignored: [],
    })
    expect(view.total).toBe(3)
    expect(view.slots).toHaveLength(3)
    expect(view.integrals).toHaveLength(1)
  })
})
