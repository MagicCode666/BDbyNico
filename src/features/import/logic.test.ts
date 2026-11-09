import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from './api'
import { chunk } from './chunk'
import { mergeIntoExisting, type ExistingItem } from './merge'
import { runImport } from './runImport'
import type { ImportPlan, ImportRow } from './types'

vi.mock('./api', () => ({
  completeTitles: vi.fn(async (rows: ImportRow[]) => ({ rows, completed: 0 })),
  createEditions: vi.fn(async (rows: ImportRow[]) => ({
    created: rows.length,
    existing: 0,
    invalid: 0,
  })),
  addItems: vi.fn(async (_userId: string, rows: ImportRow[]) => rows.length),
  updateItems: vi.fn(async () => undefined),
}))

const row = (isbn: string, overrides: Partial<ImportRow> = {}): ImportRow => ({
  isbn,
  title: `Titre ${isbn}`,
  titleMissing: false,
  seriesName: 'Série',
  volume: 1,
  authors: [],
  publisher: null,
  publishedOn: null,
  status: 'owned',
  read: false,
  price: null,
  addedAt: null,
  dedication: null,
  firstEdition: false,
  dedicationBy: null,
  acquiredOn: null,
  condition: null,
  notes: null,
  ...overrides,
})

const item = (isbn: string, overrides: Partial<ExistingItem> = {}): ExistingItem => ({
  id: `id-${isbn}`,
  isbn,
  status: 'owned',
  read: false,
  price: null,
  dedication: null,
  dedicationBy: null,
  firstEdition: false,
  acquiredOn: null,
  condition: null,
  notes: null,
  ...overrides,
})

const planOf = (...rows: ImportRow[]): ImportPlan => ({
  rows,
  warnings: [],
  skipped: [],
  stats: {
    total: rows.length,
    owned: 0,
    wanted: 0,
    read: 0,
    series: 0,
    titlesToComplete: 0,
    dedicated: 0,
    firstEditions: 0,
  },
})

describe('chunk', () => {
  it('découpe en lots, le dernier pouvant être plus petit', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
  })
  it('refuse une taille invalide', () => {
    expect(() => chunk([1], 0)).toThrow()
  })
})

describe('mergeIntoExisting', () => {
  it('fait passer une envie en possédé, jamais l’inverse', () => {
    expect(mergeIntoExisting(item('a', { status: 'wanted' }), row('a')).update.status).toBe('owned')
    expect(
      mergeIntoExisting(item('a', { status: 'owned' }), row('a', { status: 'wanted' })).update
        .status,
    ).toBe('owned')
  })
  it('cumule « lu » et « édition originale » sans rien effacer', () => {
    const { update } = mergeIntoExisting(
      item('a', { read: true, firstEdition: false }),
      row('a', { read: false, firstEdition: true }),
    )
    expect(update.read).toBe(true)
    expect(update.firstEdition).toBe(true)
  })
  it('le prix du fichier remplace le prix connu seulement quand il en donne un', () => {
    expect(
      mergeIntoExisting(item('a', { price: 10 }), row('a', { price: 12.5 })).update.price,
    ).toBe(12.5)
    expect(
      mergeIntoExisting(item('a', { price: 10 }), row('a', { price: null })).update.price,
    ).toBe(10)
  })
  it('conserve une dédicace déjà précisée (ex. dessin) face à « signature » du fichier', () => {
    const { update } = mergeIntoExisting(
      item('a', { dedication: 'drawing' }),
      row('a', { dedication: 'signature' }),
    )
    expect(update.dedication).toBe('drawing')
    expect(
      mergeIntoExisting(item('a'), row('a', { dedication: 'signature' })).update.dedication,
    ).toBe('signature')
  })
  it("remplit date d'achat, état et notes seulement s'ils étaient vides, jamais écrasés", () => {
    const filled = mergeIntoExisting(
      item('a', { acquiredOn: '2020-01-01', condition: 'Bon', notes: 'Ma note' }),
      row('a', { acquiredOn: '2024-05-05', condition: 'Neuf', notes: 'Autre' }),
    )
    expect(filled.update).toMatchObject({
      acquiredOn: '2020-01-01',
      condition: 'Bon',
      notes: 'Ma note',
    })
    const empty = mergeIntoExisting(
      item('a'),
      row('a', { acquiredOn: '2024-05-05', condition: 'Neuf', notes: 'Autre' }),
    )
    expect(empty.update).toMatchObject({
      acquiredOn: '2024-05-05',
      condition: 'Neuf',
      notes: 'Autre',
    })
  })
  it("garde l'auteur d'une dédicace existante et l'ajoute quand la dédicace vient du fichier", () => {
    expect(
      mergeIntoExisting(
        item('a', { dedication: 'drawing', dedicationBy: 'Zep' }),
        row('a', { dedication: 'signature', dedicationBy: 'Autre' }),
      ).update,
    ).toMatchObject({ dedication: 'drawing', dedicationBy: 'Zep' })
    expect(
      mergeIntoExisting(item('a'), row('a', { dedication: 'signature', dedicationBy: 'Hergé' }))
        .update,
    ).toMatchObject({ dedication: 'signature', dedicationBy: 'Hergé' })
  })
  it('signale quand rien ne change', () => {
    expect(mergeIntoExisting(item('a', { read: true }), row('a', { read: true })).changed).toBe(
      false,
    )
    expect(mergeIntoExisting(item('a'), row('a', { read: true })).changed).toBe(true)
  })
})

describe('runImport', () => {
  const noProgress = () => {}
  beforeEach(() => vi.clearAllMocks())

  it('ajoute les nouveaux albums et ignore ceux déjà présents (mode ignorer)', async () => {
    const plan = planOf(row('new1'), row('new2'), row('old1'))
    const existing = new Map([['old1', item('old1')]])
    const report = await runImport('user', plan, existing, 'skip', noProgress)

    expect(api.createEditions).toHaveBeenCalledTimes(1)
    const created = vi.mocked(api.createEditions).mock.calls[0][0]
    expect(created.map((r) => r.isbn)).toEqual(['new1', 'new2'])
    expect(api.updateItems).not.toHaveBeenCalled()
    expect(report).toMatchObject({ added: 2, editionsCreated: 2, skipped: 1, updated: 0 })
  })

  it('complète les albums déjà présents (mode compléter) et ne met à jour que ce qui change', async () => {
    const plan = planOf(row('old1', { read: true }), row('old2'))
    const existing = new Map([
      ['old1', item('old1')],
      ['old2', item('old2')],
    ])
    const report = await runImport('user', plan, existing, 'update', noProgress)

    expect(api.createEditions).not.toHaveBeenCalled()
    const updates = vi.mocked(api.updateItems).mock.calls[0][0]
    expect(updates.map((u) => u.id)).toEqual(['id-old1'])
    expect(report).toMatchObject({ added: 0, updated: 1, skipped: 1 })
  })

  it('ne cherche les titres manquants que pour les albums à ajouter', async () => {
    const plan = planOf(row('new1', { titleMissing: true }), row('old1', { titleMissing: true }))
    await runImport('user', plan, new Map([['old1', item('old1')]]), 'skip', noProgress)
    const searched = vi.mocked(api.completeTitles).mock.calls[0][0]
    expect(searched.map((r) => r.isbn)).toEqual(['new1'])
  })

  it('propage une erreur (ex. plafond quotidien) sans rien ajouter à la collection', async () => {
    vi.mocked(api.createEditions).mockRejectedValueOnce(
      new Error('Limite quotidienne de nouveaux albums atteinte'),
    )
    await expect(
      runImport('user', planOf(row('new1')), new Map(), 'skip', noProgress),
    ).rejects.toThrow('Limite quotidienne')
    expect(api.addItems).not.toHaveBeenCalled()
  })
})
