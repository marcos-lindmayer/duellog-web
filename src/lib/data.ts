import { Inflate } from 'pako'
import { parse } from 'luaparse'

export const CLASSES = ['WARRIOR', 'PALADIN', 'HUNTER', 'ROGUE', 'PRIEST', 'SHAMAN', 'MAGE', 'WARLOCK', 'DRUID', 'DEATHKNIGHT', 'MONK', 'DEMONHUNTER', 'EVOKER'] as const
export type PlayerClass = typeof CLASSES[number] | 'UNKNOWN'
export const CLASS_COLORS: Record<PlayerClass, string> = { WARRIOR: '#c79c6e', PALADIN: '#f58cba', HUNTER: '#abd473', ROGUE: '#fff16b', PRIEST: '#eeeeee', SHAMAN: '#5b94ff', MAGE: '#69ccf0', WARLOCK: '#b8a4ee', DRUID: '#ff9c4a', DEATHKNIGHT: '#ee657b', MONK: '#48d9ac', DEMONHUNTER: '#bc82e3', EVOKER: '#64bea6', UNKNOWN: '#ff6262' }
export const classLabel = (value: string) => value === 'UNKNOWN' ? 'Unknown' : value === 'DEATHKNIGHT' ? 'Death Knight' : value === 'DEMONHUNTER' ? 'Demon Hunter' : value.charAt(0) + value.slice(1).toLowerCase()
export interface Duel { winner: string; loser: string; timestamp: number; forfeit: boolean; winnerClass: PlayerClass; loserClass: PlayerClass; realm: string; zone: string; subzone: string; observer: string; message: string }
export interface Dataset { version: 1; duels: Duel[]; playerClasses: Record<string, PlayerClass>; importedAt: string; source: string }
export const EMPTY_DATA: Dataset = { version: 1, duels: [], playerClasses: {}, importedAt: '', source: '' }
const MAX_BYTES = 8 * 1024 * 1024
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
export function playerIdentity(fullName: string, fallbackRealm = '') {
  const normalized = fullName.trim().replace(/\s+/g, ' ')
  const separator = normalized.indexOf('-')
  const name = separator < 0 ? normalized : normalized.slice(0, separator).trim()
  const realm = separator < 0 ? fallbackRealm : normalized.slice(separator + 1)
  return { name, realm, key: `${name.toLowerCase()}-${realm.replace(/\s+/g, '').toLowerCase()}` }
}
export const tournyName = (name: string) => /\sforeverpvp$/i.test(playerIdentity(name).name)
export const duelKey = (duel: Duel) => [duel.timestamp, playerIdentity(duel.winner, duel.realm).key, playerIdentity(duel.loser, duel.realm).key, duel.forfeit ? 1 : 0].join('|')
export function adler32(bytes: Uint8Array) {
  let first = 1, second = 0
  for (const byte of bytes) { first = (first + byte) % 65521; second = (second + first) % 65521 }
  return second * 65536 + first
}
function decodePrint(value: string) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()'
  if (!value || value.length % 4 === 1 || value.length > 5600) throw new Error('Invalid compressed block encoding.')
  const result: number[] = []
  let buffer = 0, bits = 0
  for (const character of value) {
    const digit = alphabet.indexOf(character)
    if (digit < 0) throw new Error('Invalid character in compressed export.')
    buffer |= digit << bits; bits += 6
    while (bits >= 8) { result.push(buffer & 255); buffer >>>= 8; bits -= 8 }
  }
  if (buffer !== 0) throw new Error('Invalid compressed padding.')
  return new Uint8Array(result)
}
function inflateBlocks(value: string, size: number) {
  const blocks = value.split('~')
  if (blocks.length !== Math.ceil(size / 4096)) throw new Error('Incomplete compressed export.')
  const result = new Uint8Array(size)
  let dictionary: Uint8Array | undefined, position = 0
  for (const block of blocks) {
    const binary = decodePrint(block)
    if (binary.length > 4160) throw new Error('Compressed block exceeds its limit.')
    const expected = Math.min(4096, size - position)
    const inflater = new Inflate({ raw: true, ...(dictionary ? { dictionary } : {}), chunkSize: 4097 })
    const output: Uint8Array[] = []
    let length = 0
    inflater.onData = (chunk) => {
      length += chunk.length
      if (length > expected) throw new Error('Decompressed block exceeds declared size.')
      output.push(chunk)
    }
    inflater.push(binary, true)
    const remaining = (inflater as unknown as { strm: { avail_in: number } }).strm.avail_in
    if (inflater.err || length !== expected || remaining !== 0) throw new Error('Damaged compressed export.')
    for (const chunk of output) { result.set(chunk, position); position += chunk.length }
    if (!dictionary) dictionary = result.slice(0, expected)
  }
  return decoder.decode(result)
}
const knownClass = (value: unknown): PlayerClass => typeof value === 'string' && (CLASSES as readonly string[]).includes(value) ? value as PlayerClass : 'UNKNOWN'
function text(value: unknown, maximum = 2048) {
  if (typeof value !== 'string' || encoder.encode(value).length > maximum) throw new Error('Invalid text in imported data.')
  return value
}
function name(value: unknown) {
  const result = text(value, 200)
  if (!result.trim() || /[\p{Cc}|]/u.test(result)) throw new Error('Invalid player name in imported data.')
  return result
}
function duelFromObject(value: unknown): Duel {
  if (!value || typeof value !== 'object') throw new Error('Invalid duel record.')
  const record = value as Record<string, unknown>
  if (!Number.isInteger(record.timestamp) || Number(record.timestamp) <= 0 || Number(record.timestamp) > 4102444800) throw new Error('Invalid duel timestamp.')
  return { winner: name(record.winner), loser: name(record.loser), timestamp: Number(record.timestamp), forfeit: record.forfeit === true,
    winnerClass: knownClass(record.winnerClass), loserClass: knownClass(record.loserClass), realm: text(record.realm ?? '', 200),
    zone: text(record.zone ?? '', 300), subzone: text(record.subzone ?? '', 300), observer: text(record.observer ?? '', 200), message: text(record.message ?? '') }
}
function datasetFromObject(value: unknown, source: string): Dataset {
  if (!value || typeof value !== 'object') throw new Error('No DuelLog dataset found.')
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.duels) || record.duels.length > 100000) throw new Error('Invalid or oversized duel history.')
  const classes: Record<string, PlayerClass> = Object.create(null)
  if (record.playerClasses && typeof record.playerClasses === 'object') {
    const entries = Object.entries(record.playerClasses)
    if (entries.length > 100000) throw new Error('Too many player classes.')
    for (const [key, value] of entries) { if (key.length <= 400 && knownClass(value) !== 'UNKNOWN') classes[key] = knownClass(value) }
  }
  return { version: 1, duels: record.duels.map(duelFromObject), playerClasses: classes, source, importedAt: new Date().toISOString() }
}
export function parseJsonDataset(input: string): Dataset {
  if (encoder.encode(input).length > 32 * 1024 * 1024) throw new Error('JSON dataset exceeds 32 MB.')
  return datasetFromObject(JSON.parse(input), 'public/data.json')
}
function inspectString(input: string): Dataset {
  const normalized = input.replace(/\s/g, '')
  if (normalized.length > MAX_BYTES + 512) throw new Error('Export exceeds the 8 MB limit.')
  const match = /^!DuelLog:([123])!(\d+)!(\d+)!(\d+)!(\d+)!(.*)$/.exec(normalized)
  if (!match) throw new Error('Not a supported DuelLog export string.')
  const [, version, duelCountText, classCountText, sizeText, checksumText, encoded] = match
  const duelCount = Number(duelCountText), classCount = Number(classCountText), size = Number(sizeText)
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES || duelCount > 100000 || classCount > 100000) throw new Error('Invalid export counts or size.')
  const payload = version === '3' ? inflateBlocks(encoded, size) : encoded.replace(/!/g, '\n').replace(version === '2' ? /~/g : /$^/g, '|')
  const bytes = encoder.encode(payload)
  if (bytes.length !== size) throw new Error(`Incomplete export: ${bytes.length} of ${size} bytes.`)
  if (adler32(bytes) !== Number(checksumText)) throw new Error('Export checksum does not match.')
  const duels: Duel[] = [], classes: Record<string, PlayerClass> = Object.create(null)
  const decode = (field: string) => { try { return decodeURIComponent(field) } catch { throw new Error('Invalid escaped data in export.') } }
  let classLines = 0
  for (const line of payload.split('\n')) {
    const fields = line.split('|').map(decode)
    if (fields[0] === 'D' && fields.length === 12) {
      if (!['0', '1'].includes(fields[4]) || (fields[5] !== 'UNKNOWN' && knownClass(fields[5]) === 'UNKNOWN') || (fields[6] !== 'UNKNOWN' && knownClass(fields[6]) === 'UNKNOWN')) throw new Error('Invalid duel fields.')
      duels.push(duelFromObject({ winner: fields[1], loser: fields[2], timestamp: Number(fields[3]), forfeit: fields[4] === '1', winnerClass: fields[5], loserClass: fields[6], zone: fields[7], subzone: fields[8], realm: fields[9], observer: fields[10], message: fields[11] }))
    } else if (fields[0] === 'C' && fields.length === 3) {
      if (!fields[1] || fields[1].length > 400 || /\p{Cc}/u.test(fields[1]) || classes[fields[1]] || knownClass(fields[2]) === 'UNKNOWN') throw new Error('Invalid or duplicate player class.')
      classes[fields[1]] = knownClass(fields[2]); classLines++
    } else throw new Error('Unknown export record type.')
  }
  if (duels.length !== duelCount || classLines !== classCount) throw new Error('Export record counts do not match.')
  return { version: 1, duels, playerClasses: classes, importedAt: new Date().toISOString(), source: `DuelLog export v${version}` }
}
interface LuaNode { type: string; raw?: string; value?: unknown; name?: string; fields?: LuaNode[]; key?: LuaNode; variables?: LuaNode[]; init?: LuaNode[]; body?: LuaNode[] }
function luaString(raw: string) {
  if (raw.startsWith('[')) return raw.replace(/^\[(=*)\[\r?\n?/, '').replace(/\](=*)\]$/, '')
  const inner = raw.slice(1, -1), bytes: number[] = []
  const escapes: Record<string, number> = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11 }
  for (let index = 0; index < inner.length;) {
    if (inner[index] !== '\\') {
      const next = inner.indexOf('\\', index), end = next < 0 ? inner.length : next
      bytes.push(...encoder.encode(inner.slice(index, end))); index = end; continue
    }
    index++
    const decimal = /^\d{1,3}/.exec(inner.slice(index))
    if (decimal) { const byte = Number(decimal[0]); if (byte > 255) throw new Error('Invalid Lua string escape.'); bytes.push(byte); index += decimal[0].length; continue }
    const character = inner[index++]
    if (character === '\r') { if (inner[index] === '\n') index++; bytes.push(10) }
    else bytes.push(escapes[character] ?? character.charCodeAt(0))
  }
  return decoder.decode(new Uint8Array(bytes))
}
function luaValue(node: LuaNode): unknown {
  if (node.type === 'StringLiteral') return luaString(node.raw ?? '')
  if (node.type === 'NumericLiteral' || node.type === 'BooleanLiteral') return node.value
  if (node.type === 'NilLiteral') return null
  if (node.type !== 'TableConstructorExpression') throw new Error('SavedVariables must contain literal data, not executable expressions.')
  const result: Record<string, unknown> = Object.create(null)
  let next = 1
  for (const field of node.fields ?? []) {
    const key = field.type === 'TableValue' ? next++ : field.type === 'TableKeyString' ? field.key?.name : luaValue(field.key!)
    if (typeof key !== 'string' && typeof key !== 'number') throw new Error('Invalid Lua table key.')
    result[String(key)] = luaValue(field.value as LuaNode)
  }
  const keys = Object.keys(result)
  if (keys.length && keys.every((key, index) => key === String(index + 1))) return keys.map(key => result[key])
  return result
}
export function parseSavedVariables(input: string): Dataset {
  if (encoder.encode(input).length > 32 * 1024 * 1024) throw new Error('SavedVariables file exceeds 32 MB.')
  const ast = parse(input, { luaVersion: '5.1', encodingMode: 'none' }) as unknown as LuaNode
  for (const statement of ast.body ?? []) {
    if (statement.type !== 'AssignmentStatement') continue
    const index = statement.variables?.findIndex(node => node.type === 'Identifier' && node.name === 'DuelLogDB') ?? -1
    if (index >= 0) {
      const data = luaValue(statement.init![index]) as Record<string, unknown>
      if (data.duels && !Array.isArray(data.duels) && Object.keys(data.duels as object).length === 0) data.duels = []
      return datasetFromObject(data, 'DuelLog SavedVariables')
    }
  }
  throw new Error('This Lua file does not contain DuelLogDB.')
}
export function mergeDatasets(current: Dataset, incoming: Dataset) {
  const classes = { ...incoming.playerClasses, ...current.playerClasses }
  for (const duel of [...current.duels, ...incoming.duels]) for (const role of ['winner', 'loser'] as const) {
    const key = playerIdentity(duel[role], duel.realm).key, value = duel[`${role}Class`]
    if ((!classes[key] || classes[key] === 'UNKNOWN') && value !== 'UNKNOWN') classes[key] = value
  }
  const records = new Map<string, Duel>()
  for (const record of [...current.duels, ...incoming.duels]) {
    const key = duelKey(record), existing = records.get(key)
    records.set(key, existing ? { ...existing, winnerClass: existing.winnerClass === 'UNKNOWN' ? record.winnerClass : existing.winnerClass, loserClass: existing.loserClass === 'UNKNOWN' ? record.loserClass : existing.loserClass } : { ...record })
  }
  const duels = [...records.values()].map(record => ({ ...record, winnerClass: record.winnerClass === 'UNKNOWN' ? classes[playerIdentity(record.winner, record.realm).key] ?? 'UNKNOWN' : record.winnerClass, loserClass: record.loserClass === 'UNKNOWN' ? classes[playerIdentity(record.loser, record.realm).key] ?? 'UNKNOWN' : record.loserClass })).sort((first, second) => first.timestamp - second.timestamp)
  if (duels.length > 100000) throw new Error('Merged history exceeds 100,000 records.')
  return { dataset: { version: 1 as const, duels, playerClasses: classes, importedAt: new Date().toISOString(), source: incoming.source }, added: duels.length - current.duels.length }
}
export interface ImportSession { key?: string; count?: number; parts: Map<number, string> }
export function readImport(input: string, session: ImportSession): { dataset?: Dataset; received?: number; count?: number } {
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > 32 * 1024 * 1024) throw new Error('Empty or oversized import.')
  if (trimmed.startsWith('{')) return { dataset: datasetFromObject(JSON.parse(trimmed), 'JSON backup') }
  if (!trimmed.startsWith('!DuelLog')) return { dataset: parseSavedVariables(trimmed) }
  const normalized = trimmed.replace(/\s/g, '')
  if (!normalized.startsWith('!DuelLogPart:')) return { dataset: inspectString(normalized) }
  const match = /^!DuelLogPart:([12])!(\d+)!(\d+)!(\d+)!(\d+)!(\d+)!(.*)$/.exec(normalized)
  if (!match) throw new Error('Invalid export part header.')
  const [, version, checksum, indexText, countText, sizeText, chunkChecksum, chunk] = match
  const index = Number(indexText), count = Number(countText), size = Number(sizeText), partSize = version === '1' ? 12000 : 60000
  if (!Number.isSafeInteger(size) || size > MAX_BYTES + 512 || size <= partSize || count !== Math.ceil(size / partSize) || index < 1 || index > count) throw new Error('Invalid part counts.')
  if (chunk.length !== (index < count ? partSize : size - (count - 1) * partSize) || adler32(encoder.encode(chunk)) !== Number(chunkChecksum)) throw new Error(`Part ${index} is incomplete or damaged.`)
  const key = `${checksum}:${size}:${count}`
  if (session.key && session.key !== key) throw new Error('This part belongs to a different export. Reset the import first.')
  if (session.parts.has(index) && session.parts.get(index) !== chunk) throw new Error('Conflicting export part.')
  session.key = key; session.count = count; session.parts.set(index, chunk)
  if (session.parts.size < count) return { received: session.parts.size, count }
  const assembled = Array.from({ length: count }, (_, position) => session.parts.get(position + 1)!).join('')
  if (assembled.length !== size || adler32(encoder.encode(assembled)) !== Number(checksum)) throw new Error('Assembled checksum failed.')
  return { dataset: inspectString(assembled), received: count, count }
}