import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SeriesData } from '../series/api'
import OtherEditions from './OtherEditions'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))

const edition = (isbn: string, volume: number | null, publisher: string, kind = 'album') => ({
  isbn,
  title: 'Tome',
  volume,
  coverUrl: null,
  authors: [],
  publisher,
  kind: kind as 'album',
})

const data = {
  series: { id: 's1', name: 'Série' },
  editions: [
    edition('9782205073492', 2, 'Dupuis'),
    edition('9782746522930', 2, 'Le Pommier'),
    edition('9782800100005', 3, 'Dupuis'),
    edition('9782800100012', 2, 'Intégrale', 'integral'),
  ],
  items: [{ id: 'i1', isbn: '9782746522930', status: 'owned' }],
} as unknown as SeriesData

function renderBlock(isbn: string) {
  return render(
    <MemoryRouter>
      <OtherEditions data={data} currentIsbn={isbn} />
    </MemoryRouter>,
  )
}

describe('OtherEditions', () => {
  afterEach(cleanup)

  it('liste les autres éditions du même tome, signale celle de ma collection', () => {
    renderBlock('9782205073492')
    expect(screen.getByRole('heading', { name: /Autre édition de ce tome/i })).toBeTruthy()
    expect(screen.getByText('Le Pommier')).toBeTruthy()
    expect(screen.getByText('Dans ma collection')).toBeTruthy()
    expect(screen.queryByText('Intégrale')).toBeNull()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/collection/9782746522930')
  })

  it('n’affiche rien quand le tome n’a qu’une édition', () => {
    const { container } = renderBlock('9782800100005')
    expect(container.textContent).toBe('')
  })
})
