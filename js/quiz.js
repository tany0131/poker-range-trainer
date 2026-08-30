// 出題ロジック。

const REVIEW_PROBABILITY = 0.35

// hint = くわしい版 / easyHint = やさしい版 (「やさしく」ON のときに使う)。
const MODES = [
  {
    id: 'rfi',
    label: 'RFI',
    drills: () => RFI_DRILLS,
    hint: '自分より前が全員フォールド。オープンレイズするか降りるか。169 ハンド全部から実戦の出現頻度どおりに出題する。',
    easyHint: 'まだ誰も参加していない場面。あなたが最初の参加者になる (レイズ) か、降りるかの二択。まずはここから。',
  },
  {
    id: 'boundary',
    label: '境界特訓',
    drills: () => RFI_DRILLS,
    boundaryOnly: true,
    hint: 'RFI のうち、ポジションによって答えが変わるハンドだけを出題する。ここだけが本当に覚える価値のある領域。',
    easyHint: '席によって答えが変わる手だけを出します。他の手は「どこからでも出す」「どこからでも降りる」なので覚える必要がありません。ここだけが本当の勝負どころ。',
  },
  {
    id: 'vsrfi',
    label: '3ベット',
    drills: () => VS_RFI_DRILLS,
    hint: '誰かが先にレイズ済み。フォールド / コール / 3ベットの3択。RFI の次に頻度が高い場面。',
    easyHint: '誰かが先にレイズしています。降りるか、同じ額を払って付いていく (コール) か、上から被せて大きくする (3ベット) かの三択。',
  },
  {
    id: 'sizing',
    label: 'サイズ',
    drills: () => SIZING_DRILLS,
    noHand: true,
    hint: 'いくら賭けるか。bb = ビッグブラインド1個ぶんの額で、持ち金は全スポット 100bb。つまり 7.5bb は持ち金の 7.5%。サイズは手に依存しない (同じ額で打つから読まれない) ので、ここではカードを配らない。覚えるのは オープン 2.5bb (SB だけ 3bb) と 3ベット IP 3x / OOP 4x の2本だけ。',
    easyHint: 'いくら賭けるかの練習。bb = いちばん安い賭け金1個ぶんの単位で、持ち金は 100bb。額は手の強さでは変えない (変えると読まれる) ので、ここではカードを配りません。覚えるのは2つだけです。',
  },
  {
    id: 'hu',
    label: 'ヘッズアップ',
    drills: () => HU_DRILLS,
    hint: '実戦の「残り2人」で浅くなった時の、オールインかフォールドか。答えはこのアプリのナッシュ均衡ソルバー (下の「プッシュ/フォールド ソルバー」カード) が計算した均衡そのもの。8 / 10 / 15bb の押す側と受ける側で 6 スポット。',
    easyHint: '相手があと1人しかいなくて、持ち点も少なくなった場面。ここでは「全部賭ける (オールイン)」か「降りる」かの二択しかありません。答えはこのアプリが自分で計算した理論上の正解です。',
  },
  {
    id: 'weakness',
    label: '苦手',
    // 苦手はモード横断で拾う。ハンド別成績が付くドリル (= カードを配るもの) が対象。
    drills: () => [...DRILLS, ...HU_DRILLS],
    hint: '一度でも間違えて、まだ取り返せていない手だけを全スポット横断で出題する。ミス数より2回多く正解すると卒業。苦手が空のときは全スポットから普通に出る。',
    easyHint: 'あなたが前に間違えた手だけが出ます。同じ手をミスより2回多く正解できれば卒業して出なくなります。まだ間違いが無ければ、ふつうの出題になります。',
  },
  {
    id: 'mixed',
    label: 'ミックス',
    drills: () => DRILLS,
    hint: '実戦と同じように、RFI と 3ベットの場面がランダムに混ざって来る。仕上げ用。',
    easyHint: '本番と同じように、いろんな場面がランダムに来ます。仕上げ用なので、他のモードに慣れてから。',
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
const drawFresh = (modeId, focusKey = null, state = null) => {
  const mode = MODE_BY_ID[modeId] || MODE_BY_ID.rfi

  // 苦手モードは (スポット, ハンド) のペアを直接引く。プールが空なら通常の出題へ落ちる。
  if (mode.id === 'weakness' && !focusKey && state) {
    // 苦手はドリルをまたいで貯まるので、モードの担当ドリルに絞ってから引く
    const allowed = new Set(mode.drills().map((drill) => drill.key))
    const pool = weakHands(state).filter((item) => allowed.has(item.drillKey))
    if (pool.length > 0) {
      const item = randomOf(pool)
      return { drillKey: item.drillKey, hand: item.hand, isReview: false }
    }
  }

  const drill = focusKey && DRILL_BY_KEY[focusKey] ? DRILL_BY_KEY[focusKey] : randomOf(mode.drills())

  // サイズはハンドに依存しないので配らない (配ると「手で額が変わる」と誤解させる)。
  const hand = mode.noHand ? null : mode.boundaryOnly ? drawBoundaryHand() : drawWeightedHand()

  return { drillKey: drill.key, hand, isReview: false }
}

// その復習を今のモードで出してよいか。
// 復習キューはモードをまたいで貯まるので、ここで絞らないと サイズモードにカード付きの
// レンジ問題が出てくる (逆も然り)。境界特訓も同様に、境界ハンド以外を出さない。
const isReviewableIn = (mode, item) => {
  if (!mode.drills().some((drill) => drill.key === item.drillKey)) return false
  if (mode.boundaryOnly && !BOUNDARY_HAND_SET.has(item.hand)) return false
  return true
}

// 間違えたハンドは優先キューに入り、一定確率で再出題される (軽い間隔反復)。
// 常に { question, reviewQueue } を返す。復習を引いたときだけキューが縮む。
// 引いた時点では外すだけで、卒業させるか戻すかは recordAnswer (stats.js) が決める。
// question には item の streak (これまでの連続正解回数) がそのまま乗る。
const takeQuestion = (state) => {
  const queue = state.reviewQueue
  const mode = MODE_BY_ID[state.mode] || MODE_BY_ID.rfi
  const useReview = queue.length > 0 && Math.random() < REVIEW_PROBABILITY

  // 狙い撃ち中は、そのスポットの復習だけを拾う (他スポットの復習が割り込むと集中が切れる)
  const eligible = queue
    .map((item, i) => [item, i])
    .filter(([item]) => isReviewableIn(mode, item))
    .filter(([item]) => !state.focus || item.drillKey === state.focus)

  if (!useReview || eligible.length === 0) {
    return { question: drawFresh(state.mode, state.focus, state), reviewQueue: queue }
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

// ---- レンジ穴埋めテスト ----
// チャートの「境界線上」(隣のマスと答えが変わる場所) だけを隠す。
// 中身が一様な領域を隠しても記憶のテストにならないため。

const FILL_BLANK_COUNT = 12

const fillCandidates = (drill) => {
  const at = (row, col) => ALL_HANDS[row * 13 + col]
  const out = []

  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const hand = at(row, col)
      const action = drill.answerFor(hand)

      const neighbors = []
      if (row > 0) neighbors.push(at(row - 1, col))
      if (row < 12) neighbors.push(at(row + 1, col))
      if (col > 0) neighbors.push(at(row, col - 1))
      if (col < 12) neighbors.push(at(row, col + 1))

      if (neighbors.some((neighbor) => drill.answerFor(neighbor) !== action)) out.push(hand)
    }
  }
  return out
}

const pickFillBlanks = (drill) => {
  const pool = fillCandidates(drill)
  const count = Math.min(FILL_BLANK_COUNT, pool.length)
  const blanks = []
  for (let i = 0; i < count; i++) {
    const index = Math.floor(Math.random() * pool.length)
    blanks.push(pool[index])
    pool.splice(index, 1)
  }
  return blanks
}

const gradeFillGuesses = (drill, blanks, guesses) => {
  const wrong = blanks
    .filter((hand) => guesses[hand] !== drill.answerFor(hand))
    .map((hand) => ({ hand, correct: drill.answerFor(hand) }))
  const pct = Math.round(((blanks.length - wrong.length) / blanks.length) * 100)
  return { pct, wrong }
}
