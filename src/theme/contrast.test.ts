import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/** Contrastes WCAG des jetons de couleur, lus dans index.css pour chaque thème. */
const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf-8')

function blockOf(selector: string): string {
  const start = css.indexOf(selector)
  const open = css.indexOf('{', start)
  const close = css.indexOf('\n}', open)
  return css.slice(open + 1, close)
}

function tokens(selector: string): Record<string, string> {
  const block = blockOf(selector)
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]),
  )
}

/** Fond d'une pastille « soft » (couleur translucide) posée sur la surface. */
function softOnSurface(block: string, name: string, surface: string): string {
  const match = block.match(
    new RegExp(String.raw`--${name}-soft:\s*rgb\((\d+) (\d+) (\d+) / ([0-9.]+)\)`),
  )
  if (!match) throw new Error(`jeton --${name}-soft introuvable`)
  const alpha = Number(match[4])
  const base = [1, 3, 5].map((i) => parseInt(surface.slice(i, i + 2), 16))
  const mixed = [1, 2, 3].map((i, k) =>
    Math.round(base[k] * (1 - alpha) + Number(match[i]) * alpha),
  )
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
}

export function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// [texte, fond, minimum] : 4,5 pour le texte courant, 3 pour les grands titres et éléments d'interface
const PAIRS: [string, string, number][] = [
  ['fg', 'bg', 4.5],
  ['fg', 'surface', 4.5],
  ['fg', 'raised', 4.5],
  ['muted', 'bg', 4.5],
  ['muted', 'surface', 4.5],
  ['muted', 'raised', 4.5],
  ['accent-text', 'bg', 4.5],
  ['accent-text', 'surface', 4.5],
  ['accent-text', 'raised', 4.5],
  ['on-accent', 'accent', 4.5],
  ['on-accent', 'accent-strong', 4.5],
  ['danger-text', 'surface', 4.5],
  ['danger-text', 'bg', 4.5],
  ['ok', 'surface', 4.5],
  ['warn', 'surface', 4.5],
  ['steel', 'surface', 4.5],
  ['accent', 'bg', 3],
  ['accent', 'surface', 3],
  ['line-strong', 'surface', 1.2],
]

describe.each([
  ['rouille', ":root[data-theme='rouille']"],
  ['clair', ":root[data-theme='clair']"],
])('contrastes du thème %s', (_name, selector) => {
  const colors = tokens(selector)

  it.each(PAIRS)('%s sur %s ≥ %s', (text, background, minimum) => {
    expect(colors[text], `jeton --${text}`).toBeTruthy()
    expect(colors[background], `jeton --${background}`).toBeTruthy()
    const value = ratio(colors[text], colors[background])
    expect(value, `${text} sur ${background} : ${value.toFixed(2)}`).toBeGreaterThanOrEqual(minimum)
  })
  it.each(['ok', 'warn', 'danger'])('%s lisible sur sa pastille translucide', (name) => {
    const text = name === 'danger' ? colors['danger-text'] : colors[name]
    const background = softOnSurface(blockOf(selector), name, colors.surface)
    const value = ratio(text, background)
    expect(value, `${name} : ${value.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
  })
})
