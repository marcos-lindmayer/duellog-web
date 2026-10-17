import type { Dataset, Duel, PlayerClass } from './data'
import { playerIdentity } from './data'
export function createDemoDataset(): Dataset {
  const names = ['Aeron Foreverpvp', 'Mirel Foreverpvp', 'Sable Foreverpvp', 'Taren Foreverpvp', 'Elara Dawnstar', 'Kael Foreverpvp', 'Vessa Foreverpvp', 'Orin Ashfall', 'Lyra Foreverpvp', 'Darian Foreverpvp', 'Faye Foreverpvp', 'Alden Moonbrook', 'Sylas Foreverpvp', 'Nessa Foreverpvp', 'Riven Stormvale', 'Briar Foreverpvp', 'Arlen Foreverpvp', 'Thalia Foreverpvp', 'Corin Foreverpvp', 'Eira Frostwhisper', 'Rowan Foreverpvp', 'Liora Foreverpvp', 'Galen Foreverpvp', 'Seren Foreverpvp']
  const classes: PlayerClass[] = ['MAGE', 'PRIEST', 'ROGUE', 'WARRIOR', 'PALADIN', 'WARLOCK', 'HUNTER', 'DRUID', 'SHAMAN']
  let seed = 29
  const random = () => { seed = seed * 48271 % 2147483647; return seed / 2147483647 }
  const duels: Duel[] = [], playerClasses: Dataset['playerClasses'] = {}
  names.forEach((name, index) => { playerClasses[playerIdentity(name, 'Forever PvP').key] = classes[index % classes.length] })
  const now = Math.floor(Date.now() / 1000)
  for (let index = 0; index < 684; index++) {
    const first = Math.floor(random() * names.length)
    let second = Math.floor(random() * names.length)
    if (second === first) second = (second + 1) % names.length
    const firstWins = random() < 0.5 + (second - first) / 75
    const winner = firstWins ? first : second, loser = firstWins ? second : first
    duels.push({ winner: names[winner], loser: names[loser], timestamp: now - (684 - index) * 1500, forfeit: random() < 0.035, winnerClass: classes[winner % classes.length], loserClass: random() < 0.04 ? 'UNKNOWN' : classes[loser % classes.length], realm: 'Forever PvP', zone: 'Durotar', subzone: index % 5 ? 'Durotar' : 'Razor Hill', observer: 'Demo Observer', message: `${names[winner]} has defeated ${names[loser]} in a duel.` })
  }
  return { version: 1, duels, playerClasses, source: 'Demo data', importedAt: new Date().toISOString() }
}