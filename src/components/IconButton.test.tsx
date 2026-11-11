import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import IconButton from './IconButton'
import ViewToggle from './ViewToggle'

describe('IconButton', () => {
  afterEach(cleanup)

  it('est un lien avec un nom accessible quand on lui donne une destination', () => {
    render(
      <MemoryRouter>
        <IconButton to="/collection/ajouter" icon="plus" label="Ajouter un album" />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Ajouter un album' })
    expect(link.getAttribute('href')).toBe('/collection/ajouter')
    expect(link.getAttribute('title')).toBe('Ajouter un album')
  })

  it('est un bouton qui déclenche son action, sauf désactivé', () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <IconButton icon="heart" label="Mettre en envie" onClick={onClick} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mettre en envie' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(<IconButton icon="heart" label="Mettre en envie" onClick={onClick} disabled />)
    fireEvent.click(screen.getByRole('button', { name: 'Mettre en envie' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('ViewToggle', () => {
  afterEach(cleanup)

  it('marque la vue active et change de vue', () => {
    const onChange = vi.fn()
    render(<ViewToggle value="grille" onChange={onChange} />)
    expect(
      screen.getByRole('button', { name: 'Affichage en grille' }).getAttribute('aria-pressed'),
    ).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Affichage en liste' }))
    expect(onChange).toHaveBeenCalledWith('liste')
  })
})
