import { describe, expect, it } from 'vitest'

import { seriesProgress } from './progress'

describe('seriesProgress', () => {
  it('compte les tomes possédés sur les tomes visés', () => {
    const progress = seriesProgress({ total: 6, ownedVolumes: [1, 2, 4], ignored: [] })
    expect(progress).toEqual({ owned: 3, target: 6, complete: false, missing: [3, 5, 6] })
  })

  it("ne vise pas les tomes exclus qu'on ne possède pas", () => {
    const progress = seriesProgress({ total: 6, ownedVolumes: [1, 2], ignored: [3, 4, 5, 6] })
    expect(progress).toMatchObject({ owned: 2, target: 2, complete: true, missing: [] })
  })

  it("un tome possédé compte même s'il est exclu", () => {
    const progress = seriesProgress({ total: 3, ownedVolumes: [1, 2, 3], ignored: [2] })
    expect(progress).toMatchObject({ owned: 3, target: 3, complete: true })
  })

  it('une intégrale possédée, tomes unitaires exclus : série complète pour soi', () => {
    const progress = seriesProgress({
      total: 3,
      ownedVolumes: [],
      ignored: [1, 2, 3],
      ownsIntegral: true,
    })
    expect(progress).toMatchObject({ owned: 0, target: 0, complete: true, missing: [] })
  })

  it('sans rien posséder, tout exclu ne rend pas la série complète', () => {
    const progress = seriesProgress({ total: 3, ownedVolumes: [], ignored: [1, 2, 3] })
    expect(progress.complete).toBe(false)
  })

  it("l'intégrale seule ne complète pas une série dont les tomes ne sont pas exclus", () => {
    const progress = seriesProgress({
      total: 3,
      ownedVolumes: [],
      ignored: [],
      ownsIntegral: true,
    })
    expect(progress).toMatchObject({ owned: 0, target: 3, complete: false, missing: [1, 2, 3] })
  })

  it('un tome 0 connu du catalogue compte, même sans le posséder (10 tomes pour 0 à 9)', () => {
    const progress = seriesProgress({
      total: 9,
      ownedVolumes: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      ignored: [],
      hasVolumeZero: true,
    })
    expect(progress).toMatchObject({ owned: 9, target: 10, complete: false, missing: [0] })
  })

  it('on peut exclure le tome 0 : 9 / 9 et la série est complète pour soi', () => {
    const progress = seriesProgress({
      total: 9,
      ownedVolumes: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      ignored: [0],
      hasVolumeZero: true,
    })
    expect(progress).toMatchObject({ owned: 9, target: 9, complete: true, missing: [] })
  })

  it('posséder le tome 0 donne 10 / 10', () => {
    const progress = seriesProgress({
      total: 9,
      ownedVolumes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      ignored: [],
      hasVolumeZero: true,
    })
    expect(progress).toMatchObject({ owned: 10, target: 10, complete: true })
  })

  it("sans tome 0 dans le catalogue, il n'est pas réclamé", () => {
    expect(seriesProgress({ total: 2, ownedVolumes: [1, 2], ignored: [] })).toMatchObject({
      owned: 2,
      target: 2,
      complete: true,
    })
  })

  it('un tome possédé plus grand que le total relève le total', () => {
    expect(
      seriesProgress({ total: 5, ownedVolumes: [1, 2, 3, 4, 5, 6], ignored: [] }),
    ).toMatchObject({
      owned: 6,
      target: 6,
      complete: true,
    })
  })

  it("sans total connu, la série n'est pas complète", () => {
    expect(seriesProgress({ total: null, ownedVolumes: [], ignored: [] }).complete).toBe(false)
  })
})
