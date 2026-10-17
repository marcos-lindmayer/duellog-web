import { describe, expect, it } from 'vitest'
import { buildPlayers, classOverview, matchups, opponentRecords, rankedPlayers, selectDuels, wilson } from './analytics'
import { EMPTY_DATA } from './data'
import type { Duel } from './data'
const duel = (winner: string, loser: string, timestamp: number, winnerClass: Duel['winnerClass'] = 'MAGE', loserClass: Duel['loserClass'] = 'PRIEST'): Duel => ({ winner, loser, timestamp, winnerClass, loserClass, realm: 'Realm', zone: '', subzone: '', observer: '', message: '', forfeit: false })
describe('addon-compatible analytics', () => {
  it('replays from 1500 with stable chronological Elo', () => {
    const first = duel('Alpha Name', 'Beta Name', 1)
    const players = buildPlayers([first], {})
    expect(players.find(player => player.name === 'Alpha Name')!.mmr).toBe(1516)
    expect(players.find(player => player.name === 'Beta Name')!.mmr).toBe(1484)
    const matches = [duel('Alpha Name', 'Beta Name', 2), first, duel('Beta Name', 'Alpha Name', 3)]
    const ranked = rankedPlayers(buildPlayers(matches, {}), 'mmr')
    expect(ranked.reduce((total, player) => total + player.mmr, 0)).toBeCloseTo(3000)
    expect(buildPlayers(matches.reverse(), {}).map(player => player.mmr)).toEqual(buildPlayers(matches, {}).map(player => player.mmr))
    expect(buildPlayers([first, first], {}).find(player => player.name === 'Alpha Name')!.mmr).toBe(1516)
  })
  it('weights win rate by sample size', () => {
    expect(wilson(20, 5)).toBeGreaterThan(wilson(1, 0))
    expect(wilson(0, 0)).toBe(0)
  })
  it('excludes matches if either class is unknown', () => {
    const known = duel('Alpha Name', 'Beta Name', 1)
    const unknownWinner = duel('Unknown One', 'Beta Name', 2, 'UNKNOWN', 'PRIEST')
    const unknownLoser = duel('Alpha Name', 'Unknown Two', 3, 'MAGE', 'UNKNOWN')
    const selected = selectDuels({ ...EMPTY_DATA, duels: [known, unknownWinner, unknownLoser] }, false)
    expect(selected).toEqual([known])
    expect(buildPlayers(selected, {}).every(player => player.class !== 'UNKNOWN')).toBe(true)
  })
  it('keeps mirror games balanced and overall class ranking mirror-free', () => {
    const history = [duel('Priest One', 'Priest Two', 1, 'PRIEST', 'PRIEST'), duel('Priest Two', 'Priest One', 2, 'PRIEST', 'PRIEST'), duel('Priest One', 'Mage One', 3, 'PRIEST', 'MAGE')]
    const mirror = matchups(history, { class: 'PRIEST' }).find(entry => entry.class === 'PRIEST')!
    expect(mirror).toMatchObject({ duels: 2, wins: 2, losses: 2, winRate: 50 })
    expect(classOverview(history).find(entry => entry.class === 'PRIEST')).toMatchObject({ duels: 1, wins: 1, mirrors: 2, players: 2 })
    expect(opponentRecords(history, { class: 'PRIEST' }, 'PRIEST')).toHaveLength(2)
    expect(opponentRecords(history, { player: 'priest one-realm' }, 'MAGE')[0].winRate).toBe(100)
  })
})