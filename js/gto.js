// GTO 計算のランタイム。
//
// matchups.js の対戦マトリクスを土台に、
//  (1) equityVsRange: レンジ相手のエクイティ (エクイティ電卓)
//  (2) solvePushFold: SB vs BB のプッシュ/フォールドのナッシュ均衡 (本物の GTO を端末内で計算)
// を提供する。
//
// (2) は fictitious play (お互いに相手の平均戦略への最適応答を取り続けて平均する) で解く。
// 解の品質は「搾取可能性」(最適応答にどれだけ搾取されるか) で測れる — これが十分小さいことが
// 「均衡 = GTO」の定義そのもので、tools/verify.mjs が毎回それを検査する。

// ---- カードリムーバル込みのコンボ数 ----

const GTO_SUITS = [0, 1, 2, 3]

// クラスの全コンボ (card = rankIndex*4 + suit)。RANK_IDX は ranges.js のもの。
const gtoCombosOfClass = (hand) => {
  const hi = RANK_IDX[hand[0]]
  const lo = RANK_IDX[hand[1]]
  const out = []
  if (isPair(hand)) {
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) out.push([hi * 4 + a, hi * 4 + b])
  } else if (isSuited(hand)) {
    for (const s of GTO_SUITS) out.push([hi * 4 + s, lo * 4 + s])
  } else {
    for (const a of GTO_SUITS) for (const b of GTO_SUITS) if (a !== b) out.push([hi * 4 + a, lo * 4 + b])
  }
  return out
}

// hero がそのクラスの代表コンボを持つとき、villain クラスに残るコンボ数。
// スートは対称なので代表コンボ 1 つで数えれば十分。
const heroRepCombo = (hand) => gtoCombosOfClass(hand)[0]

const compatCombos = (heroHand, villainHand) => {
  const [c1, c2] = heroRepCombo(heroHand)
  return gtoCombosOfClass(villainHand).filter(
    ([v1, v2]) => v1 !== c1 && v1 !== c2 && v2 !== c1 && v2 !== c2,
  ).length
}

// 全クラスへの重み (カードリムーバル込み) を事前計算。169×169。
const COMPAT_WEIGHTS = (() => {
  const table = new Map()
  for (const hero of UNIQUE_HANDS) {
    const row = new Map()
    for (const villain of UNIQUE_HANDS) row.set(villain, compatCombos(hero, villain))
    table.set(hero, row)
  }
  return table
})()

// ---- (1) レンジ相手のエクイティ ----

// hand が rangeSet (ハンドクラスの Set / 配列) と最後まで行ったときの勝率 (%)。
// 各クラスをカードリムーバル込みのコンボ数で重み付けする。
const equityVsRange = (hand, range) => {
  const weights = COMPAT_WEIGHTS.get(hand)
  let sum = 0
  let total = 0
  for (const villain of range) {
    const weight = weights.get(villain)
    if (weight === 0) continue
    sum += weight * equityVs(hand, villain)
    total += weight
  }
  return total > 0 ? sum / total : 0
}

// ---- (2) プッシュ/フォールドのナッシュ均衡 ----
//
// 状況: ヘッズアップ (SB vs BB)、両者 stackBb。SB はオールイン (ジャム) かフォールド、
// BB はコールかフォールドの二択。この単純化されたゲームは厳密に解ける。
// EV は SB 視点の bb 単位。フォールド = -0.5 (SB を捨てる)。BB のフォールド = SB が +1 取る。
// コールされたら 2×stack のポットを equity で分ける: EV = 2×stack×eq − stack。

const NASH_ITERATIONS = 400

const solvePushFold = (stackBb) => {
  const hands = UNIQUE_HANDS
  const n = hands.length

  // 平均戦略 (= 出力する均衡近似)。ジャム/コールの頻度 0..1
  const jamAvg = new Array(n).fill(0.5)
  const callAvg = new Array(n).fill(0.5)

  // hero=i のとき villain=j である確率の重み行列 (前計算済みの COMPAT_WEIGHTS を配列化)
  const weightRow = hands.map((hero) => hands.map((villain) => COMPAT_WEIGHTS.get(hero).get(villain)))
  const equityRow = hands.map((hero) => hands.map((villain) => equityVs(hero, villain)))

  // SB が hand i でジャムしたときの EV (BB の平均コール戦略に対して)
  const jamEvOf = (i, callFreqs) => {
    let ev = 0
    let total = 0
    const weights = weightRow[i]
    const equities = equityRow[i]
    for (let j = 0; j < n; j++) {
      const w = weights[j]
      if (w === 0) continue
      const call = callFreqs[j]
      const showdown = 2 * stackBb * (equities[j] / 100) - stackBb
      ev += w * (call * showdown + (1 - call) * 1)
      total += w
    }
    return ev / total
  }

  // BB が hand j でコールしたときの EV (SB の平均ジャムレンジに対して)。BB 視点 bb 単位。
  const callEvOf = (j, jamFreqs) => {
    let ev = 0
    let total = 0
    const weights = weightRow[j]
    const equities = equityRow[j]
    for (let i = 0; i < n; i++) {
      const w = weights[i] * jamFreqs[i]
      if (w === 0) continue
      ev += w * (2 * stackBb * (equities[i] / 100) - stackBb)
      total += w
    }
    return total > 0 ? ev / total : 0
  }

  for (let t = 1; t <= NASH_ITERATIONS; t++) {
    // 相手の「平均」戦略への最適応答 (0/1) を取り、平均に混ぜ込む
    const jamBest = hands.map((_, i) => (jamEvOf(i, callAvg) > -0.5 ? 1 : 0))
    const callBest = hands.map((_, j) => (callEvOf(j, jamAvg) > -1 ? 1 : 0))

    const mix = 1 / (t + 1)
    for (let k = 0; k < n; k++) {
      jamAvg[k] += (jamBest[k] - jamAvg[k]) * mix
      callAvg[k] += (callBest[k] - callAvg[k]) * mix
    }
  }

  // 搾取可能性 = 最適応答にどれだけ上乗せされるか (小さいほど均衡に近い)
  const sbExploit = hands.reduce((sum, hand, i) => {
    const best = Math.max(jamEvOf(i, callAvg), -0.5)
    const current = jamAvg[i] * jamEvOf(i, callAvg) + (1 - jamAvg[i]) * -0.5
    return sum + combosOf(hand) * (best - current)
  }, 0) / TOTAL_COMBOS

  const bbExploit = hands.reduce((sum, hand, j) => {
    const best = Math.max(callEvOf(j, jamAvg), -1)
    const current = callAvg[j] * callEvOf(j, jamAvg) + (1 - callAvg[j]) * -1
    return sum + combosOf(hand) * (best - current)
  }, 0) / TOTAL_COMBOS

  const jamFreq = Object.fromEntries(hands.map((hand, i) => [hand, jamAvg[i]]))
  const callFreq = Object.fromEntries(hands.map((hand, j) => [hand, callAvg[j]]))

  const pctOfFreq = (freq) =>
    (UNIQUE_HANDS.reduce((sum, hand) => sum + combosOf(hand) * freq[hand], 0) / TOTAL_COMBOS) * 100

  return {
    stackBb,
    jam: jamFreq,
    call: callFreq,
    jamPct: pctOfFreq(jamFreq),
    callPct: pctOfFreq(callFreq),
    exploitability: Math.max(sbExploit, bbExploit),
  }
}
