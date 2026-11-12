import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { describeChange } from '../governance/describe'
import type { Change } from '../governance/api'
import SeriesCorrector from '../series/SeriesCorrector'
import EditionCorrector from './EditionCorrector'
import type { Edition } from './types'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const correctEdition = vi.fn()
const setEditionSeries = vi.fn()
const correctIsbn = vi.fn()
const mergeEditions = vi.fn()
const mergeSeries = vi.fn()
const renameSeries = vi.fn()
const listSeriesAdmin = vi.fn()
vi.mock('../governance/api', () => ({
  correctEdition: (...args: unknown[]) => correctEdition(...args),
  setEditionSeries: (...args: unknown[]) => setEditionSeries(...args),
  correctIsbn: (...args: unknown[]) => correctIsbn(...args),
  mergeEditions: (...args: unknown[]) => mergeEditions(...args),
  mergeSeries: (...args: unknown[]) => mergeSeries(...args),
  renameSeries: (...args: unknown[]) => renameSeries(...args),
  listSeriesAdmin: (...args: unknown[]) => listSeriesAdmin(...args),
  governanceErrorMessage: (_error: unknown, fallback: string) => fallback,
}))

const edition: Edition = {
  isbn: '9782746522930',
  title: 'Delta',
  volume: 3,
  authors: ['Fanny Taillandier'],
  publisher: 'Le Pommier',
  publishedOn: '2022-01-01',
  coverUrl: null,
  series: { id: 's1', name: 'Empires', totalVolumes: 5 },
}

describe('EditionCorrector', () => {
  const onChanged = vi.fn()
  beforeEach(() => {
    correctEdition.mockReset().mockResolvedValue(1)
    setEditionSeries.mockReset().mockResolvedValue(undefined)
    correctIsbn
      .mockReset()
      .mockImplementation((_old: string, next: string) => Promise.resolve(next))
    mergeEditions.mockReset().mockResolvedValue(1)
    onChanged.mockReset()
  })
  afterEach(cleanup)

  const onIsbnChanged = vi.fn()
  function open() {
    onIsbnChanged.mockReset().mockResolvedValue(undefined)
    render(
      <EditionCorrector edition={edition} onChanged={onChanged} onIsbnChanged={onIsbnChanged} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Corriger les informations de l’album' }))
  }

  it("n'envoie que les champs modifiés", async () => {
    open()
    fireEvent.change(screen.getByLabelText('Titre'), {
      target: { value: 'La Compagnie de la croix blanche' },
    })
    fireEvent.change(screen.getByLabelText('Numéro de tome'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les corrections' }))
    await waitFor(() =>
      expect(correctEdition).toHaveBeenCalledWith('9782746522930', {
        title: 'La Compagnie de la croix blanche',
        volume: null,
      }),
    )
    expect(onChanged).toHaveBeenCalled()
  })

  it('ne contacte pas le serveur quand rien ne change', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les corrections' }))
    expect(correctEdition).not.toHaveBeenCalled()
    expect(screen.getByText('Aucun changement.')).toBeTruthy()
  })

  it('refuse un numéro de tome qui n’est pas un entier', () => {
    open()
    fireEvent.change(screen.getByLabelText('Numéro de tome'), { target: { value: '3,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les corrections' }))
    expect(correctEdition).not.toHaveBeenCalled()
    expect(screen.getByText(/nombre entier/)).toBeTruthy()
  })

  it('corrige l’ISBN puis prévient la page, sans recharger l’ancienne', async () => {
    open()
    fireEvent.change(screen.getByLabelText(/^ISBN/), { target: { value: '9782205073492' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les corrections' }))
    await waitFor(() => expect(correctIsbn).toHaveBeenCalledWith('9782746522930', '9782205073492'))
    await waitFor(() => expect(onIsbnChanged).toHaveBeenCalledWith('9782205073492', false))
    expect(onChanged).not.toHaveBeenCalled()
    expect(correctEdition).not.toHaveBeenCalled()
  })

  it('refuse un ISBN invalide', () => {
    open()
    fireEvent.change(screen.getByLabelText(/^ISBN/), { target: { value: '9782746522931' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les corrections' }))
    expect(correctIsbn).not.toHaveBeenCalled()
    expect(screen.getByText(/ISBN invalide/)).toBeTruthy()
  })

  it('propose de fusionner quand l’ISBN existe déjà', async () => {
    correctIsbn.mockRejectedValue({ code: '23505', message: 'Cet ISBN existe déjà' })
    open()
    fireEvent.change(screen.getByLabelText(/^ISBN/), { target: { value: '9782205073492' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer les corrections' }))
    const merge = await screen.findByRole('button', { name: 'Fusionner dans l’album existant' })
    expect(mergeEditions).not.toHaveBeenCalled()
    fireEvent.click(merge)
    await waitFor(() =>
      expect(mergeEditions).toHaveBeenCalledWith('9782746522930', '9782205073492'),
    )
    await waitFor(() => expect(onIsbnChanged).toHaveBeenCalledWith('9782205073492', true))
  })

  it('retire l’album de sa série', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Retirer l’album de sa série' }))
    await waitFor(() => expect(setEditionSeries).toHaveBeenCalledWith('9782746522930', null))
  })
})

describe('SeriesCorrector', () => {
  beforeEach(() => {
    renameSeries.mockReset().mockResolvedValue(undefined)
    mergeSeries.mockReset().mockResolvedValue(3)
    listSeriesAdmin.mockReset().mockResolvedValue([
      {
        id: 's2',
        name: 'Boule et Bill',
        totalVolumes: 46,
        totalSource: 'auto',
        publicationStatus: null,
        statusSource: 'auto',
        editionCount: 36,
      },
    ])
  })
  afterEach(cleanup)

  function renderCorrector() {
    return render(
      <MemoryRouter>
        <SeriesCorrector seriesId="s1" name="Boule & Bill" albumCount={31} onChanged={vi.fn()} />
      </MemoryRouter>,
    )
  }

  it('renomme la série', async () => {
    renderCorrector()
    fireEvent.change(screen.getByLabelText('Nom de la série'), {
      target: { value: 'Les parfums du pouvoir' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Renommer la série' }))
    await waitFor(() => expect(renameSeries).toHaveBeenCalledWith('s1', 'Les parfums du pouvoir'))
  })

  it('demande confirmation avant de fusionner', async () => {
    renderCorrector()
    fireEvent.click(screen.getByRole('button', { name: 'Choisir la série à conserver' }))
    fireEvent.change(screen.getByLabelText('Série à conserver'), { target: { value: 'boule' } })
    fireEvent.click(await screen.findByRole('button', { name: /Boule et Bill/ }))
    expect(mergeSeries).not.toHaveBeenCalled()
    expect(screen.getByText(/l’annuler/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Oui, fusionner' }))
    await waitFor(() => expect(mergeSeries).toHaveBeenCalledWith('s1', 's2'))
  })
})

describe('describeChange', () => {
  const change = (kind: Change['kind'], oldValue: string | null, newValue: string | null) =>
    ({ kind, oldValue, newValue }) as Change

  it('décrit les corrections d’album', () => {
    expect(describeChange(change('edition_title', 'Delta', 'La Compagnie'))).toBe(
      'Titre : « Delta » → « La Compagnie »',
    )
    expect(describeChange(change('edition_volume', '3', ''))).toBe('Numéro : tome 3 → sans numéro')
    expect(describeChange(change('edition_authors', '["A"]', '["A","B"]'))).toBe(
      'Auteurs : A → A, B',
    )
    expect(describeChange(change('edition_series', 's1', ''))).toBe('Album détaché de sa série')
  })
})
