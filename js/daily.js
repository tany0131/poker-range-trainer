// 毎日の特訓メニュー。
//
// 「今日やる4つ」を日付から決め打ちして、進捗を今日の解答ログ (state.daily.log) から数える。
// 練習を始めるのに「何をやるか決める」という一番だるい工程を消すのが狙い。
//
// メニューは日付で決まるので、同じ日に何度開いても同じ課題が出る。
// 進捗はタスクを「開始」しなくても数える — 普通に練習していれば勝手に埋まる。

const DAILY_TARGETS = { boundary: 20, spot: 15, weak: 15, sizing: 10 }

// 弱点として狙い撃つ最低条件。試行が少ないうちにノイズを弱点と決めつけない。
const DAILY_WEAK_MIN_ASKED = LEAK_MIN_ASKED

// 正解率が目標に届いていないスポットのうち、最も低いもの。exclude は「今日のスポット」と被らせないため。
const weakestDrill = (state, excludeKey) => {
  const ranked = DRILLS.filter((drill) => drill.key !== excludeKey)
    .map((drill) => ({ drill, rate: drillRate(state, drill.key) }))
    .filter(
      ({ drill, rate }) =>
        rate !== null && rate < TARGET_RATE && state.byDrill[drill.key].asked >= DAILY_WEAK_MIN_ASKED,
    )
    .sort((a, b) => a.rate - b.rate)

  return ranked.length > 0 ? ranked[0].drill : null
}

// 日付から今日の課題スポットを引く。連番なので毎日ずれていき、19 日で一周する。
const rotationDrill = (dayNumber, offset) => DRILLS[(dayNumber + offset) % DRILLS.length]

const buildTasks = (state, dayNumber) => {
  const spot = rotationDrill(dayNumber, 0)

  // 弱点が無い日 (まだ試行が少ない / 全部目標超え) は、ローテーションの別スポットを復習に回す。
  const weak = weakestDrill(state, spot.key)
  const weakDrill = weak || rotationDrill(dayNumber, 7)
  const isRealWeak = Boolean(weak)

  return [
    {
      id: 'boundary',
      label: '境界特訓',
      hint: `ポジションで答えが変わる ${BOUNDARY_HANDS.length} ハンドだけ。ここが知識の本体。`,
      target: DAILY_TARGETS.boundary,
      mode: 'boundary',
      focus: null,
      match: (entry) => entry.mode === 'boundary',
    },
    {
      id: 'spot',
      label: `今日のスポット — ${spot.label}`,
      hint: spot.title,
      target: DAILY_TARGETS.spot,
      mode: defaultModeFor(spot),
      focus: spot.key,
      match: (entry) => entry.drillKey === spot.key,
    },
    {
      id: 'weak',
      label: `${isRealWeak ? '弱点' : '復習'} — ${weakDrill.label}`,
      hint: isRealWeak
        ? `正解率が目標 ${(TARGET_RATE * 100).toFixed(0)}% に届いていない、いま一番弱いスポット。`
        : '目立った弱点が出ていないので、ローテーションから1つ復習に回す。',
      target: DAILY_TARGETS.weak,
      mode: defaultModeFor(weakDrill),
      focus: weakDrill.key,
      match: (entry) => entry.drillKey === weakDrill.key,
    },
    {
      id: 'sizing',
      label: 'サイズ',
      hint: 'オープンは 2.5bb (SB だけ 3bb)、3ベットは IP 3x / OOP 4x。',
      target: DAILY_TARGETS.sizing,
      mode: 'sizing',
      focus: null,
      match: (entry) => entry.mode === 'sizing',
    },
  ]
}

// 各タスクに今日の進捗を乗せて返す。
const dailyTasks = (state) => {
  const log = dailyLog(state)
  const dayNumber = dayNumberOf(todayKey())

  return buildTasks(state, dayNumber).map((task) => {
    const answered = log.filter(task.match).length
    return {
      ...task,
      done: Math.min(answered, task.target),
      isComplete: answered >= task.target,
    }
  })
}

const isDailyComplete = (state) => dailyTasks(state).every((task) => task.isComplete)

// メニューを完走した日を記録して連続日数を伸ばす。1日空けば 1 に戻る。
// 同じ日に何度呼んでも増えない (date で弾く)。
const bumpDailyStreak = (state) => {
  const today = todayKey()
  if (state.dailyStreak.date === today) return state
  if (!isDailyComplete(state)) return state

  const days = state.dailyStreak.date === yesterdayKey() ? state.dailyStreak.days + 1 : 1
  return { ...state, dailyStreak: { date: today, days } }
}
