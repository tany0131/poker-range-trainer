// 169 × 169 ハンドクラス同士の対戦勝率マトリクスを計算して js/matchups.js を生成する。
//   node tools/gen-matchups.mjs
//
// matchup(A, B) = A と B が互いに衝突しないコンボを持ち、5 枚のボードを最後まで見たときに
// A が勝つ割合 (引き分けは 0.5)。コンボの選び方は「衝突しないペアの一様分布」なので、
// カードリムーバルは織り込み済み。
//
// 評価関数は tools/gen-equity.mjs と同一のものを複製している (共有化すると生成済みの
// equity.js の再生成が必要になるため)。複製が壊れていないことは、verify.mjs が
// 「全クラスをレンジにしたときの equityVsRange = EQUITY_VS_RANDOM」の突き合わせで検出する。

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const ITERATIONS = 20000
const SEED = 20260717

// ---- 乱数 (seed 固定) ----

const mulberry32 = (seed) => {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- 7 枚評価 (gen-equity.mjs と同一) ----

const RANK_VALUE = (card) => (card >> 2) + 2

const pack = (cat, a = 0, b = 0, c = 0, d = 0, e = 0) =>
  ((((cat * 15 + a) * 15 + b) * 15 + c) * 15 + d) * 15 + e

const straightHigh = (mask) => {
  const withWheelAce = mask | ((mask >> 13) & 0b10)
  for (let high = 14; high >= 5; high--) {
    if (((withWheelAce >> (high - 4)) & 0b11111) === 0b11111) return high
  }
  return 0
}

const top5 = (mask) => {
  const out = []
  for (let r = 14; r >= 2 && out.length < 5; r--) {
    if (mask & (1 << r)) out.push(r)
  }
  while (out.length < 5) out.push(0)
  return out
}

const evaluate7 = (cards) => {
  const rankCounts = new Array(15).fill(0)
  const suitCounts = [0, 0, 0, 0]
  const suitMasks = [0, 0, 0, 0]
  let rankMask = 0

  for (const card of cards) {
    const rank = RANK_VALUE(card)
    const suit = card & 3
    rankCounts[rank]++
    suitCounts[suit]++
    suitMasks[suit] |= 1 << rank
    rankMask |= 1 << rank
  }

  const flushSuit = suitCounts.findIndex((count) => count >= 5)
  if (flushSuit >= 0) {
    const sf = straightHigh(suitMasks[flushSuit])
    if (sf > 0) return pack(8, sf)
  }

  let quad = 0
  let tripsHigh = 0
  let tripsSecond = 0
  const pairs = []
  for (let rank = 14; rank >= 2; rank--) {
    const count = rankCounts[rank]
    if (count === 4) quad = quad || rank
    else if (count === 3) {
      if (!tripsHigh) tripsHigh = rank
      else if (!tripsSecond) tripsSecond = rank
    } else if (count === 2) pairs.push(rank)
  }

  if (quad) {
    const kicker = top5(rankMask & ~(1 << quad))[0]
    return pack(7, quad, kicker)
  }

  if (tripsHigh && (tripsSecond || pairs.length > 0)) {
    const pairPart = Math.max(tripsSecond, pairs[0] || 0)
    return pack(6, tripsHigh, pairPart)
  }

  if (flushSuit >= 0) {
    const [a, b, c, d, e] = top5(suitMasks[flushSuit])
    return pack(5, a, b, c, d, e)
  }

  const straight = straightHigh(rankMask)
  if (straight > 0) return pack(4, straight)

  if (tripsHigh) {
    const kickers = top5(rankMask & ~(1 << tripsHigh))
    return pack(3, tripsHigh, kickers[0], kickers[1])
  }

  if (pairs.length >= 2) {
    const kicker = top5(rankMask & ~(1 << pairs[0]) & ~(1 << pairs[1]))[0]
    return pack(2, pairs[0], pairs[1], kicker)
  }

  if (pairs.length === 1) {
    const kickers = top5(rankMask & ~(1 << pairs[0]))
    return pack(1, pairs[0], kickers[0], kickers[1], kickers[2])
  }

  const [a, b, c, d, e] = top5(rankMask)
  return pack(0, a, b, c, d, e)
}

// ---- ハンドクラスとコンボ ----

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
const rankIndexOf = (ch) => '23456789TJQKA'.indexOf(ch)

// アプリ側 (js/ranges.js) の UNIQUE_HANDS と同じ並びを作る
const HAND_ORDER = (() => {
  const grid = []
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      if (i === j) grid.push(RANKS[i] + RANKS[i])
      else if (i < j) grid.push(RANKS[i] + RANKS[j] + 's')
      else grid.push(RANKS[j] + RANKS[i] + 'o')
    }
  }
  return [...new Set(grid)]
})()

// クラスの全コンボ (card = rankIndex*4 + suit)
const combosOfClass = (hand) => {
  const hi = rankIndexOf(hand[0])
  const lo = rankIndexOf(hand[1])
  const out = []
  if (hand[0] === hand[1]) {
    for (let s1 = 0; s1 < 4; s1++) {
      for (let s2 = s1 + 1; s2 < 4; s2++) out.push([hi * 4 + s1, hi * 4 + s2])
    }
  } else if (hand[2] === 's') {
    for (let s = 0; s < 4; s++) out.push([hi * 4 + s, lo * 4 + s])
  } else {
    for (let s1 = 0; s1 < 4; s1++) {
      for (let s2 = 0; s2 < 4; s2++) {
        if (s1 !== s2) out.push([hi * 4 + s1, lo * 4 + s2])
      }
    }
  }
  return out
}

const CLASS_COMBOS = HAND_ORDER.map(combosOfClass)

// ---- マッチアップのモンテカルロ ----

const random = mulberry32(SEED)

const simulateMatchup = (indexA, indexB) => {
  const combosA = CLASS_COMBOS[indexA]
  const combosB = CLASS_COMBOS[indexB]

  let wins = 0
  let played = 0

  while (played < ITERATIONS) {
    const a = combosA[Math.floor(random() * combosA.length)]
    const b = combosB[Math.floor(random() * combosB.length)]
    if (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) continue // 衝突は引き直し

    // 残り 48 枚からボード 5 枚
    const used = new Set([a[0], a[1], b[0], b[1]])
    const board = []
    while (board.length < 5) {
      const card = Math.floor(random() * 52)
      if (!used.has(card)) {
        used.add(card)
        board.push(card)
      }
    }

    const scoreA = evaluate7([a[0], a[1], board[0], board[1], board[2], board[3], board[4]])
    const scoreB = evaluate7([b[0], b[1], board[0], board[1], board[2], board[3], board[4]])
    if (scoreA > scoreB) wins += 1
    else if (scoreA === scoreB) wins += 0.5
    played++
  }

  return (wins / ITERATIONS) * 100
}

console.log(`169×169 の対戦マトリクスを計算中 (${ITERATIONS.toLocaleString()} 回/組, seed ${SEED})...`)
const started = Date.now()

// 上三角 (i <= j) だけ計算して 0.1% 刻みの 3 桁固定長で詰める
const packed = []
for (let i = 0; i < 169; i++) {
  for (let j = i; j < 169; j++) {
    // 同じクラス同士は鏡写しなので厳密に 50%。シミュレーションの揺らぎを入れない。
    const equity = i === j ? 50 : simulateMatchup(i, j)
    packed.push(String(Math.round(equity * 10)).padStart(3, '0'))
  }
  if ((i + 1) % 34 === 0) console.log(`  ${i + 1}/169 ...`)
}

const seconds = ((Date.now() - started) / 1000).toFixed(0)

const output = `// ハンドクラス同士の対戦勝率。tools/gen-matchups.mjs が生成する — 手で編集しない。
// matchup(A, B) = 衝突しないコンボ同士で最後まで行ったとき A が勝つ割合 (%)。
// モンテカルロ ${ITERATIONS.toLocaleString()} 回/組 / seed ${SEED} 固定。
// 上三角 (i <= j) を 0.1% 刻み 3 桁固定長で詰めてある。equityVs() で引く。

const MATCHUP_HAND_ORDER = ${JSON.stringify(HAND_ORDER)}

const MATCHUP_PACKED =
  '${packed.join('')}'

const MATCHUP_INDEX = Object.fromEntries(MATCHUP_HAND_ORDER.map((hand, i) => [hand, i]))

// 上三角の (i, j) [i <= j] が並びの何番目か
const matchupOffset = (i, j) => (i * (2 * 169 - i + 1)) / 2 + (j - i)

// A から見た B への勝率 (%)。逆向きは 100 - equity。
const equityVs = (handA, handB) => {
  const a = MATCHUP_INDEX[handA]
  const b = MATCHUP_INDEX[handB]
  const [i, j, flip] = a <= b ? [a, b, false] : [b, a, true]
  const raw = Number(MATCHUP_PACKED.slice(matchupOffset(i, j) * 3, matchupOffset(i, j) * 3 + 3)) / 10
  return flip ? 100 - raw : raw
}
`

writeFileSync(join(ROOT, 'js/matchups.js'), output)
console.log(
  `js/matchups.js を生成 (${seconds} 秒)。アンカー: AAvsKK=${packed[HAND_ORDER.indexOf('KK')]} (期待 ~820)`,
)
