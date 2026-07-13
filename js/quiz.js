// 出題ロジック。

const REVIEW_PROBABILITY = 0.35

const MODES = [
  {
    id: 'rfi',
    label: 'RFI',
    drills: () => RFI_DRILLS,
    hint: '自分より前が全員フォールド。オープンレイズするか降りるか。169 ハンド全部から実戦の出現頻度どおりに出題する。',
  },
  {
    id: 'boundary',
    label: '境界特訓',
    drills: () => RFI_DRILLS,
    boundaryOnly: true,
    hint: 'RFI のうち、ポジションによって答えが変わるハンドだけを出題する。ここだけが本当に覚える価値のある領域。',
  },
  {
    id: 'vsrfi',
    label: '3ベット',
    drills: () => VS_RFI_DRILLS,
    hint: '誰かが先にレイズ済み。フォールド / コール / 3ベットの3択。RFI の次に頻度が高い場面。',
  },
  {
    id: 'mixed',
    label: 'ミックス',
    drills: () => DRILLS,
    hint: '実戦と同じように、RFI と 3ベットの場面がランダムに混ざって来る。仕上げ用。',
  },
]

const MODE_BY_ID = Object.fromEntries(MODES.map((m) => [m.id, m]))

const randomOf = (list) => list[Math.floor(Math.random() * list.length)]

// combos 重み付き抽選。実戦の出現頻度に合わせる (AKo は AKs の3倍出る)。
const drawWeightedHand = () => {
  let roll = Math.random() * TOTAL_COMBOS
  for (const hand of UNIQUE_HANDS) {
    roll -= combosOf(hand)
    if (roll <= 0) return hand
  }
  return UNIQUE_HANDS[UNIQUE_HANDS.length - 1]
}

// 境界モードでは頻度重みを使わず一様に引く。全境界ハンドを均等に潰したいため。
const drawBoundaryHand = () => randomOf(BOUNDARY_HANDS)

// focusKey が指定されていれば、そのスポットだけを出題する (弱点の狙い撃ち)。
// ハンドの引き方はモードの規則をそのまま使う。
const drawFresh = (modeId, focusKey = null) => {
  const mode = MODE_BY_ID[modeId] || MODE_BY_ID.rfi
  const drill = focusKey && DRILL_BY_KEY[focusKey] ? DRILL_BY_KEY[focusKey] : randomOf(mode.drills())

  return {
    drillKey: drill.key,
    hand: mode.boundaryOnly ? drawBoundaryHand() : drawWeightedHand(),
    isReview: false,
  }
}

// 間違えたハンドは優先キューに入り、一定確率で再出題される (軽い間隔反復)。
// 常に { question, reviewQueue } を返す。復習を引いたときだけキューが縮む。
const takeQuestion = (state) => {
  const queue = state.reviewQueue
  const useReview = queue.length > 0 && Math.random() < REVIEW_PROBABILITY

  // 狙い撃ち中は、そのスポットの復習だけを拾う (他スポットの復習が割り込むと集中が切れる)
  const eligible = state.focus
    ? queue.map((item, i) => [item, i]).filter(([item]) => item.drillKey === state.focus)
    : queue.map((item, i) => [item, i])

  if (!useReview || eligible.length === 0) {
    return { question: drawFresh(state.mode, state.focus), reviewQueue: queue }
  }

  const [item, index] = eligible[Math.floor(Math.random() * eligible.length)]

  return {
    question: { ...item, isReview: true },
    reviewQueue: [...queue.slice(0, index), ...queue.slice(index + 1)],
  }
}

const gradeAnswer = (question, chosenAction) => {
  const drill = DRILL_BY_KEY[question.drillKey]
  const correctAction = drill.answerFor(question.hand)
  return { correctAction, isCorrect: chosenAction === correctAction }
}
