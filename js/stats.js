// 成績の保持・永続化・弱点分析。ドリル (状況) 単位で集計する。

const STORAGE_KEY = 'poker-range-trainer/v3'
const TARGET_RATE = 0.95
const HISTORY_CAP = 300
const SPARK_WINDOW = 20
const MAX_REVIEW_QUEUE = 40

// 弱点として指摘する閾値。少ない試行でノイズを断定しないための下限。
const LEAK_MIN_ASKED = 4
const LEAK_MIN_ERROR_RATE = 0.3
const LEAK_MAX_REPORTED = 4
const TENDENCY_MIN_ERRORS = 6
const TENDENCY_SKEW = 1.5

const ERROR_TOO_LOOSE = 'tooLoose' // 正解より強く行った = 開けすぎ / 手が出すぎ
const ERROR_TOO_TIGHT = 'tooTight' // 正解より弱く行った = 消極的

// アクションの強さ。ミスの向きを判定するのに使う。
const AGGRESSION = { fold: 0, call: 1, threebet: 2, raise: 2 }

const errorDirection = (chosenAction, correctAction) =>
  AGGRESSION[chosenAction] > AGGRESSION[correctAction] ? ERROR_TOO_LOOSE : ERROR_TOO_TIGHT

const emptyDrillStats = () =>
  Object.fromEntries(DRILLS.map((d) => [d.key, { asked: 0, correct: 0 }]))

const emptyCategoryStats = () =>
  Object.fromEntries(
    DRILLS.map((d) => [
      d.key,
      Object.fromEntries(
        CATEGORIES.map((c) => [c.id, { asked: 0, [ERROR_TOO_LOOSE]: 0, [ERROR_TOO_TIGHT]: 0 }]),
      ),
    ]),
  )

const freshState = () => ({
  version: 3,
  byDrill: emptyDrillStats(),
  byCategory: emptyCategoryStats(),
  streak: { current: 0, best: 0 },
  history: [],
  reviewQueue: [],
  soundOn: true,
  mode: 'rfi',
  focus: null, // 特定スポットの狙い撃ち中はそのドリルキー
})

// 保存データにドリルが足りない/多い場合に形をそろえる (レンジを足したときに古い保存が残るため)。
const reconcile = (state) => {
  const next = { ...freshState(), ...state }
  next.byDrill = { ...emptyDrillStats(), ...next.byDrill }
  next.byCategory = { ...emptyCategoryStats(), ...next.byCategory }

  for (const drill of DRILLS) {
    if (!next.byDrill[drill.key]) next.byDrill[drill.key] = { asked: 0, correct: 0 }
    const categories = next.byCategory[drill.key] || {}
    for (const category of CATEGORIES) {
      if (!categories[category.id]) {
        categories[category.id] = { asked: 0, [ERROR_TOO_LOOSE]: 0, [ERROR_TOO_TIGHT]: 0 }
      }
    }
    next.byCategory[drill.key] = categories
  }

  // 消えたドリルの復習・狙い撃ちは捨てる
  next.reviewQueue = (next.reviewQueue || []).filter((item) => DRILL_BY_KEY[item.drillKey])
  if (next.focus && !DRILL_BY_KEY[next.focus]) next.focus = null
  return next
}

const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return freshState()

    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== 3) return freshState()

    return reconcile(parsed)
  } catch {
    return freshState()
  }
}

const saveState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // localStorage 不可 (プライベートブラウズ等) でも学習は続行できる。
  }
}

// 1問ぶんの結果を畳み込む。state は書き換えず新しい値を返す。
const recordAnswer = (state, { drillKey, hand, chosenAction, correctAction, isCorrect }) => {
  const category = categoryOf(hand)
  const drillStat = state.byDrill[drillKey]
  const categoryStat = state.byCategory[drillKey][category.id]

  const nextDrill = {
    ...state.byDrill,
    [drillKey]: {
      asked: drillStat.asked + 1,
      correct: drillStat.correct + (isCorrect ? 1 : 0),
    },
  }

  const errorKey = isCorrect ? null : errorDirection(chosenAction, correctAction)
  const nextCategory = {
    ...state.byCategory,
    [drillKey]: {
      ...state.byCategory[drillKey],
      [category.id]: {
        ...categoryStat,
        asked: categoryStat.asked + 1,
        [ERROR_TOO_LOOSE]: categoryStat[ERROR_TOO_LOOSE] + (errorKey === ERROR_TOO_LOOSE ? 1 : 0),
        [ERROR_TOO_TIGHT]: categoryStat[ERROR_TOO_TIGHT] + (errorKey === ERROR_TOO_TIGHT ? 1 : 0),
      },
    },
  }

  const current = isCorrect ? state.streak.current + 1 : 0
  const nextStreak = { current, best: Math.max(current, state.streak.best) }
  const nextHistory = [...state.history, isCorrect ? 1 : 0].slice(-HISTORY_CAP)

  const shouldQueue = !isCorrect && state.reviewQueue.length < MAX_REVIEW_QUEUE
  const nextQueue = shouldQueue ? [...state.reviewQueue, { drillKey, hand }] : state.reviewQueue

  return {
    ...state,
    byDrill: nextDrill,
    byCategory: nextCategory,
    streak: nextStreak,
    history: nextHistory,
    reviewQueue: nextQueue,
  }
}

const drillRate = (state, drillKey) => {
  const { asked, correct } = state.byDrill[drillKey]
  return asked > 0 ? correct / asked : null
}

// 直近 SPARK_WINDOW 問の移動正解率。推移グラフ用。
const rollingAccuracy = (history) => {
  if (history.length < SPARK_WINDOW) return []
  const points = []
  for (let end = SPARK_WINDOW; end <= history.length; end++) {
    const window = history.slice(end - SPARK_WINDOW, end)
    points.push(window.reduce((a, b) => a + b, 0) / SPARK_WINDOW)
  }
  return points
}

// ---- 弱点分析 ----

const overallTendency = (state) => {
  let loose = 0
  let tight = 0
  for (const drill of DRILLS) {
    for (const category of CATEGORIES) {
      const stat = state.byCategory[drill.key][category.id]
      loose += stat[ERROR_TOO_LOOSE]
      tight += stat[ERROR_TOO_TIGHT]
    }
  }

  const total = loose + tight
  if (total < TENDENCY_MIN_ERRORS) return null

  if (loose > tight * TENDENCY_SKEW) {
    return `全体の傾向: 手が出すぎ。正解より強く行ったミスが ${loose} 回、弱く行ったミスが ${tight} 回。参加したい欲を抑える。`
  }
  if (tight > loose * TENDENCY_SKEW) {
    return `全体の傾向: 消極的。正解より弱く行ったミスが ${tight} 回、強く行ったミスが ${loose} 回。もう一段強気でいい。`
  }
  return `ミスの内訳は 強すぎ ${loose} 回 / 弱すぎ ${tight} 回。偏りは小さい。`
}

// (ドリル × ハンド分類) でミス率の高い組を洗い出す。
const findLeaks = (state) => {
  const leaks = []

  for (const drill of DRILLS) {
    for (const category of CATEGORIES) {
      const stat = state.byCategory[drill.key][category.id]
      const errors = stat[ERROR_TOO_LOOSE] + stat[ERROR_TOO_TIGHT]
      if (stat.asked < LEAK_MIN_ASKED || errors === 0) continue

      const errorRate = errors / stat.asked
      if (errorRate < LEAK_MIN_ERROR_RATE) continue

      const direction =
        stat[ERROR_TOO_LOOSE] > stat[ERROR_TOO_TIGHT]
          ? '手が出すぎ'
          : stat[ERROR_TOO_TIGHT] > stat[ERROR_TOO_LOOSE]
            ? '消極的'
            : '両方向'

      leaks.push({
        errorRate,
        errors,
        text: `${drill.label} の ${category.label}: ${stat.asked} 回中 ${errors} 回ミス (${direction})`,
      })
    }
  }

  return leaks
    .sort((a, b) => b.errorRate - a.errorRate || b.errors - a.errors)
    .slice(0, LEAK_MAX_REPORTED)
}
