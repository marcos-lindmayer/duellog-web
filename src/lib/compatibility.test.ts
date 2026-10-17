import { readFileSync, existsSync } from 'node:fs'
import { env } from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EMPTY_DATA, mergeDatasets, parseSavedVariables, readImport } from './data'

const fixture = fileURLToPath(new URL('./fixtures/addon-v3.txt', import.meta.url))
describe('real addon compatibility', () => {
  it.skipIf(!existsSync(fixture))('decodes dictionary-compressed output from the actual Lua exporter', () => {
    const source = readFileSync(fixture, 'utf8')
    expect(source.startsWith('!DuelLog:3!')).toBe(true)
    const dataset = readImport(source, { parts: new Map() }).dataset!
    expect(dataset.duels).toHaveLength(80)
    expect(dataset.duels[79].loser).toBe('Priest 80 Foreverpvp')
    expect(dataset.duels[0].message).toBe('René | % \n result 1')
    expect(dataset.playerClasses['alpha foreverpvp-realm']).toBe('MAGE')
    expect(() => readImport(source.slice(0, -10), { parts: new Map() })).toThrow()
  })
  it.skipIf(!env.DUELLOG_SAVE)('imports the local saved history without executing Lua', () => {
    const dataset = parseSavedVariables(readFileSync(env.DUELLOG_SAVE!, 'utf8'))
    expect(dataset.duels.length).toBeGreaterThan(100)
    expect(mergeDatasets(EMPTY_DATA, dataset).dataset.duels.length).toBeGreaterThan(100)
  })
})