import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SeriesData } from '../series/api'
import AlbumSeriesStrip from './AlbumSeriesStrip'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const deleteEntry = vi.fn()
const addCatalogueEdition = vi.fn()
vi.mock('./api', () => ({ deleteEntry: (...a: unknown[]) => deleteEntry(...a) }))
vi.mock('../series/api', () => ({
  addCatalogueEdition: (...a: unknown[]) => addCatalogueEdition(...a),
}))

const edition = (isbn: string, volume: number) => ({
  isbn,
  title: `Titre ${volume}`,
  volume,
  coverUrl: null,
  authors: [],
  kind: 'album' as const,
})

const data = {
  series: { id: 's1', name: 'Les Piliers' },
  editions: [edition('9782205073492', 1), edition('9782746522930', 2), edition('9782800100005', 3)],
  items: [
    { id: 'i1', isbn: '9782205073492', status: 'owned' },
    { id: 'i2', isbn: '9782746522930', status: 'wanted' },
  ],
} as unknown as SeriesData

describe('AlbumSeriesStrip', () => {
  const onChanged = vi.fn()
  beforeEach(() => {
    deleteEntry.mockReset().mockResolvedValue(undefined)
    addCatalogueEdition.mockReset().mockResolvedValue(undefined)
    onChanged.mockReset()
    render(
      <MemoryRouter>
        <AlbumSeriesStrip
          data={data}
          currentIsbn="9782746522930"
          userId="u1"
          onChanged={onChanged}
        />
      </MemoryRouter>,
    )
  })
  afterEach(cleanup)

  it('montre une coche, un cœur ou un plus selon l’état de chaque tome', () => {
    expect(screen.getByRole('button', { name: /Tome 1 : dans ma collection/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Tome 2 : dans mes envies/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Tome 3 : ajouter/ })).toBeTruthy()
  })

  it('demande confirmation avant de retirer un tome possédé', async () => {
    fireEvent.click(screen.getByRole('button', { name: /Tome 1 : dans ma collection/ }))
    expect(deleteEntry).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retirer de ma collection' }))
    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith('i1'))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('demande confirmation avant de retirer une envie, et peut annuler', async () => {
    fireEvent.click(screen.getByRole('button', { name: /Tome 2 : dans mes envies/ }))
    expect(screen.getByRole('heading', { name: 'Retirer des envies ?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(deleteEntry).not.toHaveBeenCalled()
  })

  it('propose d’ajouter à la collection ou aux envies', async () => {
    fireEvent.click(screen.getByRole('button', { name: /Tome 3 : ajouter/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Mettre en envie' }))
    await waitFor(() =>
      expect(addCatalogueEdition).toHaveBeenCalledWith('u1', '9782800100005', 'wanted'),
    )
  })
})
