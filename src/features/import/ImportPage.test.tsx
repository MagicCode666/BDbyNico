import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AuthContext, type AuthContextValue } from '../../auth/AuthContext'
import ThemeProvider from '../../theme/ThemeProvider'
import ImportPage from './ImportPage'

// La barre latérale interroge la base pour le pseudo : inutile ici
vi.mock('../friends/useIncomingRequests', () => ({ useIncomingRequests: () => 0 }))
vi.mock('../../components/shell/useAccountSummary', () => ({
  useAccountSummary: () => undefined,
  ROLE_LABELS: { user: '', moderator: '', admin: '' },
}))

vi.mock('./api', () => ({
  findExistingItems: vi.fn(async () => new Map()),
  ImportLimitError: class extends Error {},
}))

const noop = async () => ({ error: null })
const auth: AuthContextValue = {
  session: null,
  user: { id: 'u1' } as AuthContextValue['user'],
  loading: false,
  passwordRecovery: false,
  signUp: noop,
  signIn: noop,
  signOut: noop,
  requestPasswordReset: noop,
  updatePassword: noop,
}

function renderPage() {
  return render(
    <ThemeProvider>
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <ImportPage />
        </MemoryRouter>
      </AuthContext.Provider>
    </ThemeProvider>,
  )
}

const chooseFile = (content: string, name = 'export.csv') => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File([content], name, { type: 'text/csv' })
  fireEvent.change(input, { target: { files: [file] } })
}

const HEADER = '"Titre de la série";"Titre de l\'album";"EAN";"Tome"'

describe('ImportPage', () => {
  afterEach(cleanup)

  it('propose de choisir un fichier au départ', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Importer une collection' })).toBeTruthy()
    expect(document.querySelector('input[type="file"]')).toBeTruthy()
  })

  it("refuse un fichier qui n'est pas un export Bubble", async () => {
    renderPage()
    chooseFile('a;b;c\r\n1;2;3')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('export Bubble'))
  })

  it("affiche le récapitulatif d'un fichier valide", async () => {
    renderPage()
    chooseFile(`${HEADER}\r\n"Tintin";"Tournesol";"9782203001176";"18"`)
    await waitFor(() => expect(screen.getByText(/voici ce qui va être importé/)).toBeTruthy())
    expect(screen.getByRole('button', { name: /Importer 1 album/ })).toBeTruthy()
  })
})
