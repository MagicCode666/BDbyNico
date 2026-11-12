import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Avatar from './Avatar'
import AvatarEditor from './AvatarEditor'
import { AVATAR_MAX_CHARS, AvatarError, encodeWithin, squareCrop } from './resize'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
const saveAvatar = vi.fn()
vi.mock('./api', () => ({ saveAvatar: (...args: unknown[]) => saveAvatar(...args) }))
const resize = vi.fn()
vi.mock('./resize', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resizeAvatar: (...args: unknown[]) => resize(...args),
}))

describe('squareCrop', () => {
  it('prend le plus grand carré centré', () => {
    expect(squareCrop(400, 200)).toEqual({ sx: 100, sy: 0, side: 200 })
    expect(squareCrop(100, 300)).toEqual({ sx: 0, sy: 100, side: 100 })
    expect(squareCrop(128, 128)).toEqual({ sx: 0, sy: 0, side: 128 })
  })
})

describe('encodeWithin', () => {
  it('baisse la qualité jusqu’à tenir dans la limite', () => {
    const sizes: Record<number, number> = { 0.85: 40000, 0.7: 30000, 0.55: 20000 }
    const calls: number[] = []
    const url = encodeWithin((quality) => {
      calls.push(quality)
      return 'x'.repeat(sizes[quality] ?? 100)
    }, 25000)
    expect(url?.length).toBe(20000)
    expect(calls).toEqual([0.85, 0.7, 0.55])
  })

  it('renvoie null quand rien ne tient', () => {
    expect(encodeWithin(() => 'x'.repeat(AVATAR_MAX_CHARS + 1))).toBeNull()
  })
})

describe('resizeAvatar', () => {
  it('refuse un fichier qui n’est pas une image, ou trop lourd', async () => {
    const { resizeAvatar: actualResize } =
      await vi.importActual<typeof import('./resize')>('./resize')
    await expect(
      actualResize(new File(['a'], 'a.txt', { type: 'text/plain' })),
    ).rejects.toBeInstanceOf(AvatarError)
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.png', { type: 'image/png' })
    await expect(actualResize(big)).rejects.toThrow(/10 Mo/)
  })
})

describe('Avatar', () => {
  afterEach(cleanup)

  it('montre l’initiale en majuscule sans image', () => {
    render(<Avatar name="nico" />)
    expect(screen.getByText('N')).toBeTruthy()
  })

  it('montre l’image quand il y en a une', () => {
    const { container } = render(<Avatar name="Nico" src="data:image/webp;base64,AAAA" />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/webp;base64,AAAA')
  })
})

describe('AvatarEditor', () => {
  const onChange = vi.fn()
  beforeEach(() => {
    saveAvatar.mockReset().mockResolvedValue(undefined)
    resize.mockReset().mockResolvedValue('data:image/webp;base64,BBBB')
    onChange.mockReset()
  })
  afterEach(cleanup)

  function pick(file: File) {
    fireEvent.change(screen.getByLabelText('Image de l’avatar'), { target: { files: [file] } })
  }

  it('réduit l’image choisie, l’enregistre et prévient', async () => {
    render(<AvatarEditor userId="u1" name="Nico" avatar={null} onChange={onChange} />)
    pick(new File(['x'], 'moi.png', { type: 'image/png' }))
    await waitFor(() =>
      expect(saveAvatar).toHaveBeenCalledWith('u1', 'data:image/webp;base64,BBBB'),
    )
    expect(onChange).toHaveBeenCalledWith('data:image/webp;base64,BBBB')
  })

  it('explique un fichier refusé, sans rien enregistrer', async () => {
    resize.mockRejectedValue(new AvatarError('Ce fichier n’est pas une image.'))
    render(<AvatarEditor userId="u1" name="Nico" avatar={null} onChange={onChange} />)
    pick(new File(['x'], 'a.txt', { type: 'text/plain' }))
    expect(await screen.findByText('Ce fichier n’est pas une image.')).toBeTruthy()
    expect(saveAvatar).not.toHaveBeenCalled()
  })

  it('retire l’avatar', async () => {
    render(
      <AvatarEditor
        userId="u1"
        name="Nico"
        avatar="data:image/webp;base64,AAAA"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retirer l’avatar' }))
    await waitFor(() => expect(saveAvatar).toHaveBeenCalledWith('u1', null))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('n’offre pas de retrait quand il n’y a pas d’avatar', () => {
    render(<AvatarEditor userId="u1" name="Nico" avatar={null} onChange={onChange} />)
    expect(screen.queryByRole('button', { name: 'Retirer l’avatar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Choisir un avatar' })).toBeTruthy()
  })
})
