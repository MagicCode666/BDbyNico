import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SeriesData } from '../series/api'
import OtherEditions from './OtherEditions'

const setPrimary = vi.hoisted(() => vi.fn())
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../governance/api', async (original) => ({
  ...(await original<typeof import('../governance/api')>()),
  setPrimaryEdition: setPrimary,
}))

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

  it('un modérateur désigne ou retire l’édition principale', async () => {
    setPrimary.mockResolvedValue(undefined)
    const onChanged = vi.fn()
    render(
      <MemoryRouter>
        <OtherEditions data={data} currentIsbn="9782205073492" moderator onChanged={onChanged} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: /Retirer le choix/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Définir cette édition comme principale/ }))
    await waitFor(() => expect(setPrimary).toHaveBeenCalledWith('9782205073492', true))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('un utilisateur ordinaire ne voit pas les commandes et la principale est signalée', () => {
    const withPrimary = {
      ...data,
      editions: data.editions.map((e) =>
        e.isbn === '9782746522930' ? { ...e, isPrimary: true } : e,
      ),
    } as unknown as SeriesData
    render(
      <MemoryRouter>
        <OtherEditions data={withPrimary} currentIsbn="9782205073492" />
      </MemoryRouter>,
    )
    expect(screen.getByText('Édition principale')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
