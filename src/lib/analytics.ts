import { CLASSES, duelKey, playerIdentity, tournyName } from './data'
import type { Dataset, Duel, PlayerClass } from './data'

export interface Player { key: string; name: string; realm: string; class: PlayerClass; wins: number; losses: number; duels: number; winRate: number; score: number; mmr: number; peakMMR: number; lastChange: number; uniqueOpponents: number; concentration: number; recent: boolean[]; ratingHistory: { timestamp: number; mmr: number }[] }
export interface Matchup { class: PlayerClass; wins: number; losses: number; duels: number; winRate: number }
export interface ClassSummary extends Matchup { players: number; mirrors: number; unknownOpponents: number }
export const rate = (wins: number, losses: number) => wins + losses ? 100 * wins / (wins + losses) : 0
const compare = (first: string, second: string) => first < second ? -1 : first > second ? 1 : 0
export function wilson(wins: number, losses: number) {
  const games = wins + losses
  if (!games) return 0
  const proportion = wins / games, squared = 1.96 ** 2
  return Math.max(0, (proportion + squared / (2 * games) - 1.96 * Math.sqrt((proportion * (1 - proportion) + squared / (4 * games)) / games)) / (1 + squared / games)) * 100
}
export function selectDuels(dataset: Dataset, tournyOnly: boolean, days = 0) {
  const cutoff = days ? Date.now() / 1000 - days * 86400 : 0
  return dataset.duels.filter(duel => duel.timestamp >= cutoff && (!tournyOnly || (tournyName(duel.winner) && tournyName(duel.loser))))
}
export function buildPlayers(duels: Duel[], classes: Dataset['playerClasses']) {
  const players = new Map<string, Player>(), opponents = new Map<string, Map<string, number>>()
  const seen = new Set<string>()
  const matches = [...duels].sort((first, second) => first.timestamp - second.timestamp || compare(duelKey(first), duelKey(second)))
  function ensure(fullName: string, realm: string, token: PlayerClass) {
    const identity = playerIdentity(fullName, realm)
    let player = players.get(identity.key)
    if (!player) {
      player = { ...identity, class: classes[identity.key] ?? token, wins: 0, losses: 0, duels: 0, winRate: 0, score: 0, mmr: 1500, peakMMR: 1500, lastChange: 0, uniqueOpponents: 0, concentration: 0, recent: [], ratingHistory: [] }
      players.set(identity.key, player); opponents.set(identity.key, new Map())
    }
    if (player.class === 'UNKNOWN' && token !== 'UNKNOWN') player.class = token
    return player
  }
  for (const duel of matches) {
    const winner = ensure(duel.winner, duel.realm, duel.winnerClass), loser = ensure(duel.loser, duel.realm, duel.loserClass)
    for (const [player, opponent, won] of [[winner, loser, true], [loser, winner, false]] as const) {
      player[won ? 'wins' : 'losses']++; player.duels++; player.recent.push(won)
      const faced = opponents.get(player.key)!
      faced.set(opponent.key, (faced.get(opponent.key) ?? 0) + 1)
    }
    const key = duelKey(duel)
    if (winner.key === loser.key || seen.has(key)) continue
    seen.add(key)
    const change = 32 * (1 - 1 / (1 + 10 ** ((loser.mmr - winner.mmr) / 400)))
    winner.mmr += change; loser.mmr -= change
    winner.lastChange = change; loser.lastChange = -change
    for (const player of [winner, loser]) {
      if (!player.ratingHistory.length) player.ratingHistory.push({ timestamp: duel.timestamp - 1, mmr: 1500 })
      player.peakMMR = Math.max(player.peakMMR, player.mmr)
      player.ratingHistory.push({ timestamp: duel.timestamp, mmr: player.mmr })
    }
  }
  for (const player of players.values()) {
    const faced = opponents.get(player.key)!
    player.winRate = rate(player.wins, player.losses); player.score = wilson(player.wins, player.losses)
    player.uniqueOpponents = faced.size
    player.concentration = player.duels ? 100 * Math.max(0, ...faced.values()) / player.duels : 0
    player.recent = player.recent.slice(-10)
  }
  return [...players.values()]
}
export function rankedPlayers(players: Player[], mode: 'mmr' | 'score') {
  return [...players].sort((first, second) => (mode === 'mmr' ? second.mmr - first.mmr : second.score - first.score) || second.duels - first.duels || compare(first.key, second.key)).map((player, index) => ({ ...player, rank: index + 1 }))
}
export function classOverview(duels: Duel[]): ClassSummary[] {
  const map = new Map<PlayerClass, ClassSummary>(), players = new Map<PlayerClass, Set<string>>()
  for (const token of CLASSES.slice(0, 9)) { map.set(token, { class: token, wins: 0, losses: 0, duels: 0, winRate: 0, players: 0, mirrors: 0, unknownOpponents: 0 }); players.set(token, new Set()) }
  function ensure(token: PlayerClass) {
    if (!map.has(token)) { map.set(token, { class: token, wins: 0, losses: 0, duels: 0, winRate: 0, players: 0, mirrors: 0, unknownOpponents: 0 }); players.set(token, new Set()) }
    return map.get(token)!
  }
  for (const duel of duels) {
    const mirror = duel.winnerClass !== 'UNKNOWN' && duel.winnerClass === duel.loserClass
    if (mirror) ensure(duel.winnerClass).mirrors++
    for (const role of ['winner', 'loser'] as const) {
      const token = duel[`${role}Class`]
      if (token === 'UNKNOWN') continue
      const entry = ensure(token)
      players.get(token)!.add(playerIdentity(duel[role], duel.realm).key)
      if (!mirror) {
        entry[role === 'winner' ? 'wins' : 'losses']++; entry.duels++
        if (duel[`${role === 'winner' ? 'loser' : 'winner'}Class`] === 'UNKNOWN') entry.unknownOpponents++
      }
    }
  }
  for (const entry of map.values()) { entry.players = players.get(entry.class)!.size; entry.winRate = rate(entry.wins, entry.losses) }
  return [...map.values()].sort((first, second) => second.winRate - first.winRate || second.duels - first.duels || compare(first.class, second.class))
}
export function matchups(duels: Duel[], subject: { player: string } | { class: PlayerClass }): Matchup[] {
  const map = new Map<PlayerClass, Matchup>()
  for (const duel of duels) {
    const won = 'player' in subject ? playerIdentity(duel.winner, duel.realm).key === subject.player : duel.winnerClass === subject.class
    const lost = 'player' in subject ? playerIdentity(duel.loser, duel.realm).key === subject.player : duel.loserClass === subject.class
    if (!won && !lost) continue
    const token = won ? duel.loserClass : duel.winnerClass
    const entry = map.get(token) ?? { class: token, wins: 0, losses: 0, duels: 0, winRate: 0 }
    entry.duels++; if (won) entry.wins++; if (lost) entry.losses++
    entry.winRate = rate(entry.wins, entry.losses); map.set(token, entry)
  }
  return [...map.values()].sort((first, second) => second.winRate - first.winRate || second.duels - first.duels || compare(first.class, second.class))
}
export interface Opponent { key: string; name: string; realm: string; class: PlayerClass; wins: number; losses: number; winRate: number; duels: number }
export function opponentRecords(duels: Duel[], subject: { player: string } | { class: PlayerClass }, token: PlayerClass): Opponent[] {
  const map = new Map<string, Opponent>()
  for (const duel of duels) {
    for (const role of ['winner', 'loser'] as const) {
      const other = role === 'winner' ? 'loser' : 'winner'
      const included = 'player' in subject ? playerIdentity(duel[other], duel.realm).key === subject.player : duel[`${other}Class`] === subject.class
      if (!included || duel[`${role}Class`] !== token) continue
      const identity = playerIdentity(duel[role], duel.realm)
      const entry = map.get(identity.key) ?? { ...identity, class: token, wins: 0, losses: 0, duels: 0, winRate: 0 }
      const won = 'player' in subject ? role === 'loser' : role === 'winner'
      entry[won ? 'wins' : 'losses']++; entry.duels++; entry.winRate = rate(entry.wins, entry.losses); map.set(identity.key, entry)
    }
  }
  return [...map.values()].sort((first, second) => second.winRate - first.winRate || second.duels - first.duels || compare(first.key, second.key))
}
export function dataSummary(duels: Duel[], players: Player[]) {
  return { duels: duels.length, players: players.length, coverage: duels.length ? 100 * duels.filter(duel => duel.winnerClass !== 'UNKNOWN' && duel.loserClass !== 'UNKNOWN').length / duels.length : 0,
    forfeits: duels.filter(duel => duel.forfeit).length, missing: players.filter(player => player.class === 'UNKNOWN').length }
}