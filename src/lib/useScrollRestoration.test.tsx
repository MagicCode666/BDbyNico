import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useScrollRestoration } from './useScrollRestoration'

function Page({ ready }: { ready: boolean }) {
  useScrollRestoration('page', ready)
  return null
}

const renderPage = (ready: boolean) =>
  render(
    <MemoryRouter>
      <Page ready={ready} />
    </MemoryRouter>,
  )

describe('useScrollRestoration', () => {
  const scrollTo = vi.fn()

  beforeEach(() => {
    sessionStorage.clear()
    scrollTo.mockClear()
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
  })
  afterEach(cleanup)

  it('retrouve la position mémorisée une fois le contenu affiché', () => {
    sessionStorage.setItem('bdbynico:scroll:page', '640')
    const { rerender } = renderPage(false)
    expect(scrollTo).not.toHaveBeenCalled()
    rerender(
      <MemoryRouter>
        <Page ready />
      </MemoryRouter>,
    )
    expect(scrollTo).toHaveBeenCalledWith(0, 640)
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })

  it("ne bouge pas quand il n'y a rien de mémorisé", () => {
    renderPage(true)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('mémorise la position en quittant la page', () => {
    Object.defineProperty(window, 'scrollY', { value: 1234, configurable: true })
    renderPage(true).unmount()
    expect(sessionStorage.getItem('bdbynico:scroll:page')).toBe('1234')
  })
})
