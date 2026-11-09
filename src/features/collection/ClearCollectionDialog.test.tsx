import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from './api'
import ClearCollectionDialog from './ClearCollectionDialog'

vi.mock('./api', () => ({
  countEntries: vi.fn(async () => 408),
  clearCollection: vi.fn(async () => undefined),
}))
vi.mock('../export/exportCollection', () => ({
  exportCollection: vi.fn(async () => 408),
}))

const renderDialog = () => {
  const onDone = vi.fn()
  const onCancel = vi.fn()
  render(<ClearCollectionDialog userId="u1" onDone={onDone} onCancel={onCancel} />)
  return { onDone, onCancel }
}

const confirmButton = () => screen.getByRole('button', { name: 'Vider ma collection' })

describe('ClearCollectionDialog', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it("annonce le nombre exact d'albums retirés", async () => {
    renderDialog()
    await waitFor(() => expect(screen.getByText(/408 albums/)).toBeTruthy())
  })

  it("garde le bouton rouge grisé tant que « VIDER » n'est pas saisi", async () => {
    renderDialog()
    await waitFor(() => expect(screen.getByText(/408 albums/)).toBeTruthy())
    expect((confirmButton() as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText(/Tapez/), { target: { value: 'vide' } })
    expect((confirmButton() as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Tapez/), { target: { value: 'vider' } })
    expect((confirmButton() as HTMLButtonElement).disabled).toBe(true) // casse exigée

    fireEvent.change(screen.getByLabelText(/Tapez/), { target: { value: 'VIDER' } })
    expect((confirmButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('vide la collection sans toucher aux réglages de séries par défaut', async () => {
    const { onDone } = renderDialog()
    await waitFor(() => expect(screen.getByText(/408 albums/)).toBeTruthy())
    fireEvent.change(screen.getByLabelText(/Tapez/), { target: { value: 'VIDER' } })
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(api.clearCollection).toHaveBeenCalledWith('u1', false)
  })

  it('peut réinitialiser aussi les réglages de séries, sur demande', async () => {
    const { onDone } = renderDialog()
    await waitFor(() => expect(screen.getByText(/408 albums/)).toBeTruthy())
    fireEvent.click(screen.getByLabelText(/Réinitialiser aussi/))
    fireEvent.change(screen.getByLabelText(/Tapez/), { target: { value: 'VIDER' } })
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(api.clearCollection).toHaveBeenCalledWith('u1', true)
  })

  it('ne propose rien quand la collection est déjà vide', async () => {
    vi.mocked(api.countEntries).mockResolvedValueOnce(0)
    renderDialog()
    await waitFor(() => expect(screen.getByText(/déjà vide/)).toBeTruthy())
    fireEvent.change(screen.getByLabelText(/Tapez/), { target: { value: 'VIDER' } })
    expect((confirmButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it('affiche une erreur et ne ferme pas si la suppression échoue', async () => {
    vi.mocked(api.clearCollection).mockRejectedValueOnce(new Error('boom'))
    const { onDone } = renderDialog()
    await waitFor(() => expect(screen.getByText(/408 albums/)).toBeTruthy())
    fireEvent.change(screen.getByLabelText(/Tapez/), { target: { value: 'VIDER' } })
    fireEvent.click(confirmButton())
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('a échoué'))
    expect(onDone).not.toHaveBeenCalled()
  })

  it('se ferme avec Annuler sans rien supprimer', async () => {
    const { onCancel } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onCancel).toHaveBeenCalled()
    expect(api.clearCollection).not.toHaveBeenCalled()
  })
})
