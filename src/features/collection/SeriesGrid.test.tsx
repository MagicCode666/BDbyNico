import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import SeriesGrid, { type GridCard } from './SeriesGrid'

const card = (extra: Partial<GridCard> = {}): GridCard => ({
  key: 's1',
  to: '/series/s1',
  name: 'Alpha',
  coverUrl: 'https://exemple.test/alpha.jpg',
  owned: 12,
  target: 21,
  readCount: 10,
  albumCount: 12,
  publication: 'ongoing',
  complete: false,
  showProgress: true,
  ...extra,
})

function renderGrid(cards: GridCard[]) {
  return render(
    <MemoryRouter>
      <SeriesGrid cards={cards} />
    </MemoryRouter>,
  )
}

describe('SeriesGrid', () => {
  afterEach(cleanup)

  it('mène à la série, avec la progression, les albums et les lus', () => {
    renderGrid([card()])
    expect(screen.getByRole('link', { name: 'Alpha' }).getAttribute('href')).toBe('/series/s1')
    expect(screen.getByRole('progressbar', { name: 'Progression de Alpha' })).toBeTruthy()
    expect(screen.getByText('12 / 21')).toBeTruthy()
    expect(screen.getByText('10 / 12')).toBeTruthy()
  })

  it('signale une série complète et omet la progression pour un album hors série', () => {
    renderGrid([
      card({ complete: true, publication: 'finished' }),
      card({ key: 'x', name: 'Seul', showProgress: false }),
    ])
    expect(screen.getAllByText('✓ Complète')).toHaveLength(1)
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
  })
})
