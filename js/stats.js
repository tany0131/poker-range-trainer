// 成績の保持・永続化・弱点分析。ドリル (状況) 単位で集計する。

const STORAGE_KEY = 'poker-range-trainer/v3'
const DAILY_LOG_CAP = 400
const MISS_LOG_CAP = 200
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

// ---- 日付 ----
// 「今日」はローカル日付で数える (UTC だと日本の朝がまだ前日になってしまう)。

const dateKeyOf = (date) => {
  const pad = (n) => (n < 10 ? `0${n}` : String(n))
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const todayKey = () => dateKeyOf(new Date())

const yesterdayKey = () => {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return dateKeyOf(date)
}

// 日付キーを通し番号に直す。日替わりメニューのローテーションに使う。
const dayNumberOf = (key) => {
  const [year, month, day] = key.split('-').map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000)
}

// byDrill はサイズのドリルも数える。byCategory (弱点分析) はレンジのドリルだけ。
const emptyDrillStats = () =>
  Object.fromEntries(ALL_DRILLS.map((d) => [d.key, { asked: 0, correct: 0 }]))

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
  easyMode: false, // コーチの説明を専門用語なしの言い方に切り替える (答えは変わらない)
  mode: 'rfi',
  focus: null, // 特定スポットの狙い撃ち中はそのドリルキー
  daily: { date: todayKey(), log: [] }, // 今日の解答ログ。日替わりメニューの進捗はここから数える
  dailyStreak: { date: null, days: 0 }, // メニューを完走した最終日と連続日数
  byHand: {}, // ハンド別の成績 (疎)。byHand[drillKey][hand] = { a: 出題数, w: ミス数 }
  fillBest: {}, // レンジ穴埋めテストの自己ベスト (%)。fillBest[drillKey]
  missLog: [], // 間違えた問題の履歴 (新しいものが末尾)。{ d, drillKey, hand, chosen, correct }
})

// 日付が変わっていれば今日のログは空。日付をまたいだ瞬間にメニューが自動でリセットされる。
const dailyLog = (state) =>
  state.daily && state.daily.date === todayKey() ? state.daily.log : []

// 保存データにドリルが足りない/多い場合に形をそろえる (レンジを足したときに古い保存が残るため)。
const reconcile = (state) => {
  const next = { ...freshState(), ...state }
  next.byDrill = { ...emptyDrillStats(), ...next.byDrill }
  next.byCategory = { ...emptyCategoryStats(), ...next.byCategory }

  for (const drill of ALL_DRILLS) {
    if (!next.byDrill[drill.key]) next.byDrill[drill.key] = { asked: 0, correct: 0 }
  }

  for (const drill of DRILLS) {
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

  const daily = next.daily || {}
  next.daily = {
    date: daily.date || todayKey(),
    log: (daily.log || []).filter((entry) => entry && DRILL_BY_KEY[entry.drillKey]),
  }
  const streak = next.dailyStreak || {}
  next.dailyStreak = { date: streak.date || null, days: streak.days || 0 }

  // ハンド別成績: 消えたドリルと不正なハンドを落として形をそろえる
  const byHand = {}
  for (const [drillKey, hands] of Object.entries(next.byHand || {})) {
    if (!DRILL_BY_KEY[drillKey]) continue
    const cleaned = {}
    for (const [hand, record] of Object.entries(hands || {})) {
      if (!LEGAL_HANDS.has(hand) || !record) continue
      cleaned[hand] = { a: record.a || 0, w: record.w || 0 }
    }
    if (Object.keys(cleaned).length > 0) byHand[drillKey] = cleaned
  }
  next.byHand = byHand

  const fillBest = {}
  for (const [drillKey, best] of Object.entries(next.fillBest || {})) {
    if (DRILL_BY_KEY[drillKey] && typeof best === 'number') fillBest[drillKey] = best
  }
  next.fillBest = fillBest

  next.missLog = (next.missLog || [])
    .filter((entry) => entry && DRILL_BY_KEY[entry.drillKey] && (entry.hand === null || LEGAL_HANDS.has(entry.hand)))
    .slice(-MISS_LOG_CAP)

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

// サイズのドリルは「ミスの向き (強すぎ/弱すぎ)」を持たない (額に強弱の一直線がないため)。
// ハンドにも依存しないので、ハンド分類ごとの弱点分析からは外す。
const isRangeDrill = (drillKey) => DRILL_BY_KEY[drillKey].type !== 'sizing'

// ハンド分類ごとの集計を1問ぶん進める。サイズのドリルはそのまま返す。
const foldCategory = (state, drillKey, hand, chosenAction, correctAction, isCorrect) => {
  if (!isRangeDrill(drillKey)) return state.byCategory

  const category = categoryOf(hand)
  const categoryStat = state.byCategory[drillKey][category.id]
  const errorKey = isCorrect ? null : errorDirection(chosenAction, correctAction)

  return {
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
}

// ハンド別の成績を1問ぶん進める。サイズのドリル (hand = null) は対象外。
const foldByHand = (state, drillKey, hand, isCorrect) => {
  if (hand === null || hand === undefined) return state.byHand

  const drillHands = state.byHand[drillKey] || {}
  const record = drillHands[hand] || { a: 0, w: 0 }

  return {
    ...state.byHand,
    [drillKey]: {
      ...drillHands,
      [hand]: { a: record.a + 1, w: record.w + (isCorrect ? 0 : 1) },
    },
  }
}

// 今日のログを1問ぶん進める。日付が変わっていればここで捨てて新しい日を始める。
const foldDaily = (state, drillKey) => {
  const today = todayKey()
  const log = dailyLog(state)
  return {
    date: today,
    log: [...log, { drillKey, mode: state.mode }].slice(-DAILY_LOG_CAP),
  }
}

// 1問ぶんの結果を畳み込む。state は書き換えず新しい値を返す。
const recordAnswer = (state, { drillKey, hand, chosenAction, correctAction, isCorrect }) => {
  const drillStat = state.byDrill[drillKey]

  const nextDrill = {
    ...state.byDrill,
    [drillKey]: {
      asked: drillStat.asked + 1,
      correct: drillStat.correct + (isCorrect ? 1 : 0),
    },
  }

  const current = isCorrect ? state.streak.current + 1 : 0
  const nextStreak = { current, best: Math.max(current, state.streak.best) }
  const nextHistory = [...state.history, isCorrect ? 1 : 0].slice(-HISTORY_CAP)

  const shouldQueue = !isCorrect && state.reviewQueue.length < MAX_REVIEW_QUEUE
  const nextQueue = shouldQueue ? [...state.reviewQueue, { drillKey, hand }] : state.reviewQueue

  // ミスは履歴にも残す (復習キューと違って消費されない。振り返り用)
  const nextMissLog = isCorrect
    ? state.missLog
    : [
        ...state.missLog,
        { d: todayKey(), drillKey, hand: hand ?? null, chosen: chosenAction, correct: correctAction },
      ].slice(-MISS_LOG_CAP)

  return {
    ...state,
    byDrill: nextDrill,
    byCategory: foldCategory(state, drillKey, hand, chosenAction, correctAction, isCorrect),
    byHand: foldByHand(state, drillKey, hand, isCorrect),
    streak: nextStreak,
    history: nextHistory,
    reviewQueue: nextQueue,
    daily: foldDaily(state, drillKey),
    missLog: nextMissLog,
  }
}

// ---- 苦手ハンド ----
// 「一度でも間違えて、まだ取り返せていない」手。ミス数より2つ多く正解できたら卒業。
// 苦手モードの出題プールと、成績カードの苦手リストの両方がこれを使う。

const isStillWeak = (record) => record.w > 0 && record.a - record.w < record.w + 2

const weakHands = (state) => {
  const out = []
  for (const [drillKey, hands] of Object.entries(state.byHand || {})) {
    if (!DRILL_BY_KEY[drillKey]) continue
    for (const [hand, record] of Object.entries(hands)) {
      if (isStillWeak(record)) out.push({ drillKey, hand, asked: record.a, wrong: record.w })
    }
  }
  // ミス率の高い順 (同率ならミス回数の多い順)
  return out.sort((x, y) => y.wrong / y.asked - x.wrong / x.asked || y.wrong - x.wrong)
}

// ---- レンジ穴埋めテストの自己ベスト ----

const recordFillResult = (state, drillKey, pct) => {
  const best = state.fillBest[drillKey] || 0
  if (pct <= best) return state
  return { ...state, fillBest: { ...state.fillBest, [drillKey]: pct } }
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
