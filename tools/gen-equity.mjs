// 169 ハンドの「対ランダム勝率」を計算して js/equity.js を生成する。
//   node tools/gen-equity.mjs
//
// 対ランダム勝率 = ランダムな相手 1 人と、5 枚のボードを最後まで見たときに勝つ割合
// (引き分けは 0.5 勝)。公開されている勝率表を写すのではなく、ここで実際に
// シミュレーションする。seed 固定のモンテカルロなので、再実行しても同じ数字になる。
//
// 検算は tools/verify.mjs 側でやる (AA=85.2% など解析的に知られている値と突き合わせ)。
// 生成し直すのはこのファイルを変えたときだけでよい。

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const ITERATIONS = 120000
const SEED = 20260716

// ---- 乱数 (seed 固定・再現可能) ----

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

// ---- カード表現 ----
// card = rankIndex * 4 + suit。rankIndex 0..12 (= ランク 2..A)、suit 0..3。

const RANK_VALUE = (card) => (card >> 2) + 2 // 2..14

// ---- 7 枚評価 ----
// 役のカテゴリと上位 5 枚のタイブレークを 1 つの整数に詰める。大きいほうが強い。
// カテゴリ: 8=ストレートフラッシュ 7=クワッズ 6=フルハウス 5=フラッシュ
//           4=ストレート 3=トリップス 2=ツーペア 1=ワンペア 0=ハイカード

const pack = (cat, a = 0, b = 0, c = 0, d = 0, e = 0) =>
  ((((cat * 15 + a) * 15 + b) * 15 + c) * 15 + d) * 15 + e

// rank ビットマスク (bit2..bit14) からストレートの最高位を返す。無ければ 0。
const straightHigh = (mask) => {
  const withWheelAce = mask | ((mask >> 13) & 0b10) // A を 1 としても数える
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

// ---- 評価関数の自己チェック ----
// ここが間違っていると全部の数字が静かに狂うので、生成前に既知の大小関係を確かめる。

const card = (rankChar, suit) => '23456789TJQKA'.indexOf(rankChar) * 4 + suit

const HANDS_FIXTURES = [
  // [説明, 7枚, 7枚, 期待 (1が勝つ=1 / 2が勝つ=-1)]
  ['ロイヤル > クワッズ',
    ['A0', 'K0', 'Q0', 'J0', 'T0', '20', '31'], ['A1', 'A2', 'A3', '90', '91', '92', '93'], 1],
  ['フルハウス > フラッシュ',
    ['K0', 'K1', 'K2', '30', '31', '70', '90'], ['A0', 'Q0', '90', '70', '20', 'K1', 'K2'], 1],
  ['ストレート (A ロー) が成立する',
    ['A0', '21', '32', '43', '50', 'K1', 'K2'], ['A1', 'A2', 'Q0', 'J1', '92', '81', '70'], 1],
  ['キッカー勝負 (AK > AQ が同じ A ペアで)',
    ['A0', 'K1', 'A2', '72', '83', '20', '41'], ['A1', 'Q0', 'A3', '72', '83', '20', '41'], 1],
  ['同じツーペアはキッカーで決まる',
    ['K0', 'K1', '70', '71', 'A0', '21', '32'], ['K2', 'K3', '72', '73', 'Q0', '21', '32'], 1],
]

for (const [label, first, second, expected] of HANDS_FIXTURES) {
  const parse = (list) => list.map((t) => card(t[0], Number(t[1])))
  const a = evaluate7(parse(first))
  const b = evaluate7(parse(second))
  const got = a > b ? 1 : a < b ? -1 : 0
  if (got !== expected) {
    console.error(`評価関数の自己チェック失敗: ${label} (got ${got})`)
    process.exit(1)
  }
}

// ---- 169 ハンドの代表コンボ ----
// スートは対称なので、1 ハンドにつき代表 1 コンボで足りる。

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
const rankIndexOf = (ch) => '23456789TJQKA'.indexOf(ch)

const representative = (hand) => {
  const hi = rankIndexOf(hand[0])
  const lo = rankIndexOf(hand[1])
  if (hand[0] === hand[1]) return [hi * 4 + 0, hi * 4 + 1]
  if (hand[2] === 's') return [hi * 4 + 0, lo * 4 + 0]
  return [hi * 4 + 0, lo * 4 + 1]
}

const allHands = []
for (let i = 0; i < 13; i++) {
  for (let j = 0; j < 13; j++) {
    if (i === j) allHands.push(RANKS[i] + RANKS[i])
    else if (i < j) allHands.push(RANKS[i] + RANKS[j] + 's')
  }
}
for (let i = 0; i < 13; i++) {
  for (let j = i + 1; j < 13; j++) {
    allHands.push(RANKS[i] + RANKS[j] + 'o')
  }
}

// ---- モンテカルロ ----

const random = mulberry32(SEED)

const simulate = (hand) => {
  const hero = representative(hand)
  const pool = []
  for (let c = 0; c < 52; c++) {
    if (c !== hero[0] && c !== hero[1]) pool.push(c)
  }

  let wins = 0
  const drawn = new Array(7)

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // pool から 7 枚 (相手 2 + ボード 5) を部分 Fisher-Yates で引く
    for (let k = 0; k < 7; k++) {
      const pick = k + Math.floor(random() * (pool.length - k))
      const tmp = pool[k]
      pool[k] = pool[pick]
      pool[pick] = tmp
      drawn[k] = pool[k]
    }

    const heroScore = evaluate7([hero[0], hero[1], drawn[2], drawn[3], drawn[4], drawn[5], drawn[6]])
    const villainScore = evaluate7([drawn[0], drawn[1], drawn[2], drawn[3], drawn[4], drawn[5], drawn[6]])

    if (heroScore > villainScore) wins += 1
    else if (heroScore === villainScore) wins += 0.5
  }

  return (wins / ITERATIONS) * 100
}

console.log(`169 ハンド × ${ITERATIONS.toLocaleString()} 回を計算中 (seed ${SEED})...`)
const started = Date.now()

const table = {}
for (const [index, hand] of allHands.entries()) {
  table[hand] = Number(simulate(hand).toFixed(1))
  if ((index + 1) % 34 === 0) console.log(`  ${index + 1}/169 ...`)
}

const seconds = ((Date.now() - started) / 1000).toFixed(0)

const lines = allHands.map((hand) => `  ${JSON.stringify(hand)}: ${table[hand].toFixed(1)},`)

const output = `// 対ランダム勝率 (%)。tools/gen-equity.mjs が生成する — 手で編集しない。
// 意味: その手を持って、ランダムな手の相手 1 人と 5 枚のボードを最後まで見たとき勝つ割合
// (引き分けは 0.5 勝)。モンテカルロ ${ITERATIONS.toLocaleString()} 回 / seed ${SEED} 固定なので再生成しても同じ値になる。
// これは「素の強さ」であって期待値そのものではない — 位置・ドミネート・実現しやすさが乗って
// はじめてプリフロップの答えになる。その説明は index.html の勝率カードに書いてある。

const EQUITY_VS_RANDOM = {
${lines.join('\n')}
}
`

writeFileSync(join(ROOT, 'js/equity.js'), output)
console.log(`js/equity.js を生成 (${seconds} 秒)。アンカー値: AA=${table.AA} AKs=${table.AKs} 72o=${table['72o']}`)
