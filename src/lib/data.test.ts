import { describe, expect, it } from 'vitest'
import { adler32, EMPTY_DATA, mergeDatasets, parseJsonDataset, parseSavedVariables, playerIdentity, readImport, tournyName } from './data'

const raw = 'D|Alpha%20Foreverpvp|Beta%20Othername|1792091772|0|PALADIN|MAGE|Durotar||Classic%20Beta%20PvP|Observer|Result'
const exportString = `!DuelLog:2!1!0!${raw.length}!${adler32(new TextEncoder().encode(raw))}!${raw.replaceAll('|', '~')}`
describe('addon data compatibility', () => {
  it('preserves surnames and realm identities', () => {
    expect(playerIdentity('Alpha Foreverpvp-Classic Beta PvP').key).toBe('alpha foreverpvp-classicbetapvp')
    expect(tournyName('Alpha Foreverpvp-Realm')).toBe(true)
    expect(tournyName('Alpha ForeverpvpExtra')).toBe(false)
  })
  it('imports checked strings and rejects corruption', () => {
    const dataset = readImport(exportString, { parts: new Map() }).dataset!
    expect(dataset.duels[0].winner).toBe('Alpha Foreverpvp')
    expect(dataset.duels[0].winnerClass).toBe('PALADIN')
    expect(() => readImport(exportString.slice(0, -1), { parts: new Map() })).toThrow()
    expect(mergeDatasets(dataset, dataset).dataset.duels).toHaveLength(1)
  })
  it('parses Lua literal data without executing code', () => {
    const dataset = parseSavedVariables('DuelLogDB = { ["duels"] = { { ["winner"] = "Alpha Foreverpvp", ["loser"] = "Beta Othername", ["timestamp"] = 1792091772, ["realm"] = "Realm" } }, ["playerClasses"] = { ["alpha foreverpvp-realm"] = "PALADIN" } }')
    expect(dataset.duels).toHaveLength(1)
    expect(mergeDatasets(EMPTY_DATA, dataset).dataset.duels[0].winnerClass).toBe('PALADIN')
    expect(() => parseSavedVariables('DuelLogDB = os.execute("not allowed")')).toThrow()
  })
  it('loads and validates a manually maintained JSON dataset', () => {
    const dataset = parseJsonDataset(JSON.stringify({ duels: [{ winner: 'Alpha Foreverpvp', loser: 'Beta Othername', timestamp: 1792091772, winnerClass: 'PALADIN' }], playerClasses: {} }))
    expect(dataset.duels[0].winnerClass).toBe('PALADIN')
    expect(dataset.source).toBe('public/data.json')
    expect(() => parseJsonDataset('{ invalid json')).toThrow()
  })
  it('handles escaped UTF-8 and empty saved histories', () => {
    const dataset = parseSavedVariables('DuelLogDB={duels={{winner="Ren\\195\\169 Foreverpvp",loser="Other Player",timestamp=100}},playerClasses={}}')
    expect(dataset.duels[0].winner).toBe('René Foreverpvp')
    expect(parseSavedVariables('DuelLogDB={duels={}}').duels).toEqual([])
  })
})