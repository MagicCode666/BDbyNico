import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import TabBar from './TabBar'

function renderAt(path: string, friendRequests = 0) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TabBar friendRequests={friendRequests} />
    </MemoryRouter>,
  )
}

describe('TabBar', () => {
  afterEach(cleanup)

  it('propose Collection, Amis, Ajouter, Envies et Compte', () => {
    renderAt('/collection')
    for (const name of ['Collection', 'Amis', 'Ajouter un album', 'Envies', 'Compte']) {
      expect(screen.getByRole('link', { name: new RegExp(name) })).toBeTruthy()
    }
    expect(screen.queryByRole('link', { name: /Recherche/ })).toBeNull()
  })

  it('met mes livres à gauche (collection, envies) et le social à droite (amis, compte)', () => {
    renderAt('/collection')
    const names = screen
      .getAllByRole('link')
      .map(
        (link) => link.getAttribute('aria-label') ?? link.textContent?.replace(/\d+/g, '').trim(),
      )
    expect(names).toEqual(['Collection', 'Envies', 'Ajouter un album', 'Amis', 'Compte'])
  })

  it('allume Amis sur la bibliothèque d’un ami, pas Collection', () => {
    renderAt('/amis/abc')
    expect(screen.getByRole('link', { name: /Amis/ }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: /Collection/ }).getAttribute('aria-current')).toBeNull()
  })

  it('signale les demandes d’amis en attente', () => {
    renderAt('/collection', 2)
    expect(screen.getByRole('status', { name: /2 demande/ })).toBeTruthy()
  })

  it('n’affiche pas de pastille sans demande', () => {
    renderAt('/collection', 0)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
