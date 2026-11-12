import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PseudoField from './PseudoField'

const rpc = vi.fn()
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }))
const pseudoAvailable = {
  mockReset: () => rpc.mockReset(),
  mockResolvedValue: (free: boolean) => rpc.mockResolvedValue({ data: free, error: null }),
  mockRejectedValue: (error: Error) => rpc.mockResolvedValue({ data: null, error }),
  calls: () => rpc.mock.calls,
}

function Harness({ current }: { current?: string }) {
  const [value, setValue] = useState('')
  return <PseudoField value={value} onChange={setValue} current={current} />
}

async function type(value: string) {
  fireEvent.change(screen.getByLabelText('Pseudo'), { target: { value } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
}

describe('PseudoField', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    pseudoAvailable.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('annonce un pseudo disponible, après un court délai', async () => {
    pseudoAvailable.mockResolvedValue(true)
    render(<Harness />)
    await type('Nico')
    expect(rpc).toHaveBeenCalledWith('pseudo_available', { p_pseudo: 'Nico' })
    expect(screen.getByText('Ce pseudo est disponible.')).toBeTruthy()
  })

  it('annonce un pseudo déjà pris', async () => {
    pseudoAvailable.mockResolvedValue(false)
    render(<Harness />)
    await type('Nico')
    expect(screen.getByText('Ce pseudo est déjà pris.')).toBeTruthy()
    expect(screen.getByLabelText('Pseudo').getAttribute('aria-invalid')).toBe('true')
  })

  it('ne questionne pas la base pour un pseudo de forme invalide', async () => {
    render(<Harness />)
    await type('ab')
    expect(rpc).not.toHaveBeenCalled()
    expect(screen.getByText(/au moins 3/)).toBeTruthy()
  })

  it('ne questionne pas la base pour le pseudo actuel du compte', async () => {
    render(<Harness current="Nico" />)
    await type('Nico')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('reste neutre quand la vérification échoue (la base tranchera)', async () => {
    pseudoAvailable.mockRejectedValue(new Error('réseau'))
    render(<Harness />)
    await type('Nico')
    expect(screen.queryByText('Ce pseudo est déjà pris.')).toBeNull()
    expect(screen.queryByText('Ce pseudo est disponible.')).toBeNull()
  })
})
