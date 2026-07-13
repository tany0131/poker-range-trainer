// ハンド表記とレンジ展開。ここがこのアプリの土台。
// file:// で開けるようにクラシックスクリプトとして書く (ES modules は CORS で弾かれる)。

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
const RANK_IDX = Object.fromEntries(RANKS.map((r, i) => [r, i]))
const TOTAL_COMBOS = 1326

const isPair = (hand) => hand[0] === hand[1]
const isSuited = (hand) => hand[2] === 's'
const combosOf = (hand) => (isPair(hand) ? 6 : isSuited(hand) ? 4 : 12)

// 13x13 グリッドの並び (左上 AA / 右上がスーテッド / 左下がオフスーツ)
const ALL_HANDS = (() => {
  const hands = []
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      if (i === j) hands.push(RANKS[i] + RANKS[i])
      else if (i < j) hands.push(RANKS[i] + RANKS[j] + 's')
      else hands.push(RANKS[j] + RANKS[i] + 'o')
    }
  }
  return hands
})()

const UNIQUE_HANDS = [...new Set(ALL_HANDS)]
const LEGAL_HANDS = new Set(UNIQUE_HANDS)

// ---- レンジ表記のパーサ ----
// 対応する記法: "22+" "AKs" "A9s+" "TT-99" "A9s-A8s" "K9s-K2s"
// 注意: "55+" は弱→強、"TT-99" は強→弱 でインデックスの向きが逆になる。min/max で吸収する。

const addPairSpan = (set, idxA, idxB) => {
  const lo = Math.min(idxA, idxB)
  const hi = Math.max(idxA, idxB)
  for (let i = lo; i <= hi; i++) set.add(RANKS[i] + RANKS[i])
}

const addKickerSpan = (set, high, idxA, idxB, suitedness) => {
  const lo = Math.min(idxA, idxB)
  const hi = Math.max(idxA, idxB)
  for (let i = lo; i <= hi; i++) {
    if (i <= RANK_IDX[high]) continue // キッカーが high 以上になる組は存在しない
    set.add(high + RANKS[i] + suitedness)
  }
}

const expandToken = (token, set) => {
  const text = token.trim()
  if (!text) return

  if (text.includes('-')) {
    const [from, to] = text.split('-')
    if (isPair(from)) {
      addPairSpan(set, RANK_IDX[from[0]], RANK_IDX[to[0]])
      return
    }
    if (from[0] !== to[0]) throw new Error(`不正なレンジ表記: ${text}`)
    addKickerSpan(set, from[0], RANK_IDX[from[1]], RANK_IDX[to[1]], from[2])
    return
  }

  const hasPlus = text.endsWith('+')
  const base = hasPlus ? text.slice(0, -1) : text
  const [high, low, suitedness] = base

  if (high === low) {
    if (hasPlus) addPairSpan(set, RANK_IDX[high], RANK_IDX.A)
    else set.add(high + high)
    return
  }

  if (hasPlus) addKickerSpan(set, high, RANK_IDX[low], RANK_IDX[high] + 1, suitedness)
  else set.add(high + low + suitedness)
}

const parseRange = (spec) => {
  const set = new Set()
  if (!spec) return set
  for (const token of spec.split(',')) expandToken(token, set)

  for (const hand of set) {
    if (!LEGAL_HANDS.has(hand)) throw new Error(`存在しないハンド: ${hand} (spec: ${spec})`)
  }
  return set
}

const combosIn = (set) => [...set].reduce((sum, hand) => sum + combosOf(hand), 0)
const pctOf = (set) => (combosIn(set) / TOTAL_COMBOS) * 100

// ---- ハンド分類 (弱点分析用) ----
// 上から順に最初に当たったものを採用する。

const CATEGORY_RULES = [
  { id: 'pair', label: 'ポケットペア', test: (h) => isPair(h) },
  { id: 'suited-ace', label: 'スーテッドエース', test: (h) => isSuited(h) && h[0] === 'A' },
  { id: 'suited-king', label: 'スーテッドキング', test: (h) => isSuited(h) && h[0] === 'K' },
  {
    id: 'suited-broadway',
    label: 'スーテッドブロードウェイ',
    test: (h) => isSuited(h) && RANK_IDX[h[0]] <= 4 && RANK_IDX[h[1]] <= 4,
  },
  {
    id: 'suited-connector',
    label: 'スーテッドコネクター',
    test: (h) => isSuited(h) && RANK_IDX[h[1]] - RANK_IDX[h[0]] <= 2,
  },
  { id: 'suited-other', label: 'その他スーテッド', test: (h) => isSuited(h) },
  { id: 'offsuit-ace', label: 'オフスーツエース', test: (h) => h[0] === 'A' },
  {
    id: 'offsuit-broadway',
    label: 'オフスーツブロードウェイ',
    test: (h) => RANK_IDX[h[0]] <= 4 && RANK_IDX[h[1]] <= 4,
  },
  { id: 'offsuit-other', label: 'その他オフスーツ', test: () => true },
]

const categoryOf = (hand) => CATEGORY_RULES.find((rule) => rule.test(hand))
const CATEGORIES = CATEGORY_RULES.map(({ id, label }) => ({ id, label }))
