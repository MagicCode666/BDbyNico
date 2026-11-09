import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { isbnFromBarcode } from '../../../lib/isbn'
import BarcodeScanner from './BarcodeScanner'

describe('isbnFromBarcode', () => {
  it('accepte un EAN-13 de livre valide (préfixe 978)', () => {
    expect(isbnFromBarcode('9782203001176')).toBe('9782203001176')
    expect(isbnFromBarcode(' 9782203001176 ')).toBe('9782203001176')
  })
  it('accepte le préfixe 979', () => {
    expect(isbnFromBarcode('9791234567896')).toBe('9791234567896')
  })
  it("refuse un EAN qui n'est pas un livre, une clé fausse ou un format incorrect", () => {
    expect(isbnFromBarcode('3017620422003')).toBeNull() // produit courant (préfixe 301)
    expect(isbnFromBarcode('9782203001177')).toBeNull() // clé de contrôle fausse
    expect(isbnFromBarcode('978220300117')).toBeNull()
    expect(isbnFromBarcode('')).toBeNull()
  })
})

describe('BarcodeScanner', () => {
  it("explique que la caméra est indisponible quand le navigateur n'en propose pas", async () => {
    // jsdom n'a pas de navigator.mediaDevices
    render(<BarcodeScanner onDetect={() => {}} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('pas disponible'))
  })
})
