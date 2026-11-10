import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CatalogueEdition, SeriesView } from './buildView'
import IntegralsSection from './IntegralsSection'

const edition = (extra: Partial<CatalogueEdition>): CatalogueEdition => ({
  isbn: 'isbn-1',
  title: 'La trilogie du mal',
  volume: null,
  coverUrl: null,
  authors: [],
  kind: 'integral',
  volumeFrom: 1,
  volumeTo: 3,
  ...extra,
})

const owned = { id: 'i', isbn: 'isbn-1', status: 'owned' as const, read: false }

function renderSection(
  integrals: SeriesView['integrals'],
  props: { ignored?: number[]; ownedVolumes?: number[] } = {},
) {
  const onAdd = vi.fn()
  const onIgnoreMany = vi.fn()
  render(
    <MemoryRouter>
      <IntegralsSection
        integrals={integrals}
        total={3}
        ignored={props.ignored ?? []}
        ownedVolumes={props.ownedVolumes ?? []}
        busy={false}
        onAdd={onAdd}
        onIgnoreMany={onIgnoreMany}
      />
    </MemoryRouter>,
  )
  return { onAdd, onIgnoreMany }
}

describe('IntegralsSection', () => {
  afterEach(cleanup)

  it("n'affiche rien sans intégrale", () => {
    renderSection([])
    expect(screen.queryByText(/Intégrales, coffrets/)).toBeNull()
  })

  it("affiche la plage de tomes et l'état de chaque intégrale, même partielle", () => {
    renderSection([
      { edition: edition({}), item: owned },
      {
        edition: edition({ isbn: 'isbn-2', title: 'Deuxième cycle', volumeFrom: 4, volumeTo: 6 }),
        item: null,
      },
    ])
    expect(screen.getByText(/Tomes 1 à 3 · possédée/)).toBeTruthy()
    expect(screen.getByText(/Tomes 4 à 6 · non possédée/)).toBeTruthy()
  })

  it("propose d'exclure les tomes repris, sans ceux que l'on possède déjà", () => {
    const { onIgnoreMany } = renderSection([{ edition: edition({}), item: owned }], {
      ownedVolumes: [2],
    })
    fireEvent.click(screen.getByRole('button', { name: /Exclure de ma liste les tomes 1, 3/ }))
    expect(onIgnoreMany).toHaveBeenCalledWith([1, 3])
  })

  it('une intégrale sans plage reprend toute la série', () => {
    const { onIgnoreMany } = renderSection([
      { edition: edition({ volumeFrom: null, volumeTo: null }), item: owned },
    ])
    expect(screen.getByText(/Série complète/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /tomes 1 à 3/ }))
    expect(onIgnoreMany).toHaveBeenCalledWith([1, 2, 3])
  })

  it('signale que les tomes unitaires sont déjà exclus', () => {
    renderSection([{ edition: edition({}), item: owned }], { ignored: [1, 2, 3] })
    expect(screen.getByText(/Tomes unitaires exclus/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Exclure/ })).toBeNull()
  })

  it("propose d'ajouter une intégrale du catalogue que l'on n'a pas", () => {
    const { onAdd } = renderSection([{ edition: edition({}), item: null }])
    fireEvent.click(screen.getByRole('button', { name: '+ Possédée' }))
    expect(onAdd).toHaveBeenCalledWith('isbn-1', 'owned')
  })

  it('un hors-série est présenté comme tel, sans exclusion de tomes', () => {
    renderSection([
      { edition: edition({ kind: 'special', volumeFrom: null, volumeTo: null }), item: owned },
    ])
    expect(screen.getByText(/Hors-série · possédée/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Exclure/ })).toBeNull()
  })
})
