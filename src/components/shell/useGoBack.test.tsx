import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { isEdgeSwipeBack, useEdgeSwipeBack, useGoBack } from './useGoBack'

const at = (x: number, y: number, t: number) => ({ x, y, t })

describe('isEdgeSwipeBack', () => {
  it('accepte un balayage horizontal parti du bord gauche', () => {
    expect(isEdgeSwipeBack(at(5, 300, 0), at(140, 320, 250))).toBe(true)
  })
  it('refuse un départ loin du bord, un geste court, vertical ou lent', () => {
    expect(isEdgeSwipeBack(at(60, 300, 0), at(200, 300, 200))).toBe(false)
    expect(isEdgeSwipeBack(at(5, 300, 0), at(50, 300, 100))).toBe(false)
    expect(isEdgeSwipeBack(at(5, 300, 0), at(120, 500, 200))).toBe(false)
    expect(isEdgeSwipeBack(at(5, 300, 0), at(160, 300, 1500))).toBe(false)
    expect(isEdgeSwipeBack(at(100, 300, 0), at(5, 300, 200))).toBe(false)
  })
})

const DETAIL = [
  { label: 'Accueil', to: '/' },
  { label: 'Ma collection', to: '/collection' },
  { label: 'Album' },
]

function Page({ crumbs }: { crumbs: typeof DETAIL }) {
  const goBack = useGoBack(crumbs)
  useEdgeSwipeBack(goBack)
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <div>
      <p data-testid="where">{location.pathname}</p>
      <button onClick={() => navigate('/detail')}>aller</button>
      {goBack ? <button onClick={goBack}>retour</button> : <span>racine</span>}
      <input aria-label="champ" />
    </div>
  )
}

function renderAt(path: string, crumbs = DETAIL) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<Page crumbs={crumbs} />} />
      </Routes>
    </MemoryRouter>,
  )
}

function swipe(target: Element, from: number, to: number) {
  fireEvent.touchStart(target, { touches: [{ clientX: from, clientY: 300 }] })
  fireEvent.touchEnd(target, { changedTouches: [{ clientX: to, clientY: 305 }] })
}

describe('retour', () => {
  afterEach(cleanup)

  it('n’offre pas de retour sur une page principale', () => {
    renderAt('/collection', DETAIL.slice(0, 2))
    expect(screen.getByText('racine')).toBeTruthy()
  })

  it('remonte au niveau parent quand on arrive directement sur la page', () => {
    renderAt('/detail')
    fireEvent.click(screen.getByText('retour'))
    expect(screen.getByTestId('where').textContent).toBe('/collection')
  })

  it('le balayage depuis le bord gauche déclenche le retour', () => {
    renderAt('/detail')
    swipe(document.body, 5, 160)
    expect(screen.getByTestId('where').textContent).toBe('/collection')
  })

  it('le balayage est ignoré hors du bord ou dans un champ de saisie', () => {
    renderAt('/detail')
    swipe(document.body, 100, 260)
    swipe(screen.getByLabelText('champ'), 5, 160)
    expect(screen.getByTestId('where').textContent).toBe('/detail')
  })
})
