import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from './api'
import CoverReportDialog from './CoverReportDialog'

const AMAZON = 'https://images-na.ssl-images-amazon.com/images/P/272345214X.01.LZZZZZZZ.jpg'
const BNF =
  'https://catalogue.bnf.fr/couverture?&appName=NE&idArk=ark:/12148/cb41107070n&couverture=1'
const OPEN_LIBRARY = 'https://covers.openlibrary.org/b/isbn/9782723452144-L.jpg'

// Le client Supabase exige des variables d'environnement absentes de la CI : inutile ici
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../collection/lookup/amazon', () => ({
  amazonCoverUrl: () =>
    'https://images-na.ssl-images-amazon.com/images/P/272345214X.01.LZZZZZZZ.jpg',
  imageExists: vi.fn(async () => true),
}))
vi.mock('../collection/lookup/bnf', () => ({
  findBnfCover: vi.fn(
    async () =>
      'https://catalogue.bnf.fr/couverture?&appName=NE&idArk=ark:/12148/cb41107070n&couverture=1',
  ),
}))
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  reportCover: vi.fn(async () => 'applied'),
}))

const renderDialog = (currentCover: string | null = OPEN_LIBRARY) => {
  const onClose = vi.fn()
  const onChanged = vi.fn()
  render(
    <CoverReportDialog
      isbn="9782723452144"
      title="Niveau 1"
      currentCover={currentCover}
      onClose={onClose}
      onChanged={onChanged}
    />,
  )
  return { onClose, onChanged }
}

describe('CoverReportDialog', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('propose les autres sources et pas la couverture déjà affichée', async () => {
    renderDialog(OPEN_LIBRARY)
    await waitFor(() => expect(screen.getAllByText('Choisir celle-ci')).toHaveLength(4))
    expect(screen.getByText('Amazon')).toBeTruthy()
    expect(screen.getByText('BnF')).toBeTruthy()
    expect(screen.getByText('Decitre')).toBeTruthy()
    expect(screen.getByText('AbeBooks')).toBeTruthy()
    expect(screen.queryByText('Open Library')).toBeNull()
  })

  it('envoie la couverture choisie et prévient la page quand elle est appliquée', async () => {
    const { onChanged } = renderDialog()
    await waitFor(() => expect(screen.getAllByText('Choisir celle-ci')).toHaveLength(4))
    fireEvent.click(screen.getAllByText('Choisir celle-ci')[0])
    await waitFor(() => expect(api.reportCover).toHaveBeenCalledWith('9782723452144', AMAZON))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(screen.getByText(/mise à jour pour tout le monde/)).toBeTruthy()
  })

  it('annonce une proposition en attente sans recharger la page', async () => {
    vi.mocked(api.reportCover).mockResolvedValueOnce('pending')
    const { onChanged } = renderDialog()
    await waitFor(() => expect(screen.getAllByText('Choisir celle-ci')).toHaveLength(4))
    fireEvent.click(screen.getAllByText('Choisir celle-ci')[1])
    await waitFor(() => expect(api.reportCover).toHaveBeenCalledWith('9782723452144', BNF))
    expect(await screen.findByText(/en attente de validation/)).toBeTruthy()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('permet de choisir « pas de couverture » quand il y en a une', async () => {
    renderDialog()
    await waitFor(() => expect(screen.getAllByText('Choisir celle-ci')).toHaveLength(4))
    fireEvent.click(screen.getByRole('button', { name: /pas de couverture/ }))
    await waitFor(() => expect(api.reportCover).toHaveBeenCalledWith('9782723452144', null))
  })

  it('affiche le motif quand le serveur refuse', async () => {
    vi.mocked(api.reportCover).mockRejectedValueOnce(
      new Error('Seuls les possesseurs de cet album peuvent signaler sa couverture'),
    )
    renderDialog()
    await waitFor(() => expect(screen.getAllByText('Choisir celle-ci')).toHaveLength(4))
    fireEvent.click(screen.getAllByText('Choisir celle-ci')[0])
    expect(await screen.findByText(/Seuls les possesseurs/)).toBeTruthy()
  })
})
