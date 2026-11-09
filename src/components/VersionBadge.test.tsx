import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import VersionBadge from './VersionBadge'

describe('VersionBadge', () => {
  it('affiche la version du paquet et le commit', () => {
    render(<VersionBadge />)
    const text = screen.getByTitle("Version de l'application").textContent
    expect(text).toMatch(/^v\d+\.\d+\.\d+ \(.+\)$/)
  })
})
