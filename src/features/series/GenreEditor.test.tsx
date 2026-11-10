import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import GenreEditor from './GenreEditor'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const setSeriesGenres = vi.fn<(id: string, genres: string[]) => Promise<void>>()
vi.mock('../governance/api', () => ({
  setSeriesGenres: (id: string, genres: string[]) => setSeriesGenres(id, genres),
}))

describe('GenreEditor', () => {
  const onChanged = vi.fn()
  beforeEach(() => {
    setSeriesGenres.mockReset().mockResolvedValue()
    onChanged.mockReset()
  })
  afterEach(cleanup)

  it('ajoute un genre choisi dans la liste', async () => {
    render(<GenreEditor seriesId="s1" genres={['aventure']} onChanged={onChanged} />)
    fireEvent.change(screen.getByLabelText('Ajouter un genre'), { target: { value: 'polar' } })
    await waitFor(() => expect(setSeriesGenres).toHaveBeenCalledWith('s1', ['aventure', 'polar']))
    expect(onChanged).toHaveBeenCalled()
  })

  it("retire un genre avec la croix de l'étiquette", async () => {
    render(<GenreEditor seriesId="s1" genres={['aventure', 'polar']} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le genre Aventure' }))
    await waitFor(() => expect(setSeriesGenres).toHaveBeenCalledWith('s1', ['polar']))
  })

  it('bloque la liste à trois genres et ne propose pas ceux déjà choisis', () => {
    const { rerender } = render(
      <GenreEditor seriesId="s1" genres={['aventure']} onChanged={onChanged} />,
    )
    expect(screen.queryByRole('option', { name: 'Aventure' })).toBeNull()
    rerender(
      <GenreEditor seriesId="s1" genres={['aventure', 'polar', 'humour']} onChanged={onChanged} />,
    )
    expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(true)
  })

  it('signale une erreur', async () => {
    setSeriesGenres.mockRejectedValue(new Error('refus'))
    render(<GenreEditor seriesId="s1" genres={['aventure']} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le genre Aventure' }))
    expect(await screen.findByText('Impossible de modifier les genres.')).toBeTruthy()
  })
})
