import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from './api'
import DeleteAccountDialog from './DeleteAccountDialog'

vi.mock('./api', () => ({
  LAST_ADMIN_MESSAGE: 'dernier admin',
  deleteMyAccount: vi.fn(async () => undefined),
}))
vi.mock('../export/exportCollection', () => ({
  exportCollection: vi.fn(async () => 10),
}))

const renderDialog = () => {
  const onDone = vi.fn()
  const onCancel = vi.fn()
  render(<DeleteAccountDialog onDone={onDone} onCancel={onCancel} />)
  return { onDone, onCancel }
}

const confirmButton = () => screen.getByRole('button', { name: 'Supprimer mon compte' })
const type = (value: string) =>
  fireEvent.change(screen.getByLabelText(/Tapez/), { target: { value } })

describe('DeleteAccountDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(cleanup)

  it('reste inactif tant que le mot de confirmation n’est pas saisi', () => {
    renderDialog()
    expect((confirmButton() as HTMLButtonElement).disabled).toBe(true)
    type('supprim')
    expect((confirmButton() as HTMLButtonElement).disabled).toBe(true)
    type('SUPPRIMER')
    expect((confirmButton() as HTMLButtonElement).disabled).toBe(false)
  })

  it('supprime le compte puis prévient', async () => {
    const { onDone } = renderDialog()
    type('SUPPRIMER')
    fireEvent.click(confirmButton())
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(api.deleteMyAccount).toHaveBeenCalledTimes(1)
  })

  it('garde le compte et explique quand le dernier administrateur essaie', async () => {
    vi.mocked(api.deleteMyAccount).mockImplementationOnce(async () => {
      throw new Error('dernier admin')
    })
    const { onDone } = renderDialog()
    type('SUPPRIMER')
    fireEvent.click(confirmButton())
    await waitFor(() => expect(screen.getByText('dernier admin')).toBeTruthy())
    expect(onDone).not.toHaveBeenCalled()
  })

  it('propose un export avant de supprimer', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /Exporter ma collection/ }))
    await waitFor(() => expect(screen.getByText('Fichier téléchargé.')).toBeTruthy())
  })

  it('annule sans rien supprimer', () => {
    const { onCancel } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onCancel).toHaveBeenCalled()
    expect(api.deleteMyAccount).not.toHaveBeenCalled()
  })
})
