// 成績カードの描画。ドリル別の表・推移グラフ・弱点・苦手ハンド・ミス履歴・トグル。

const SPARK_W = 320
const SPARK_H = 56
const SPARK_PAD = 4

// ---- 成績 ----

const rateClass = (rate, baseline) => {
  if (rate * 100 < baseline) return 'rate low'
  if (rate >= TARGET_RATE) return 'rate high'
  return 'rate mid'
}

// 狙い撃ち中であることを常に見えるところに出す。
// 出題が偏っている理由が分からないまま回されるのが一番まずい。
const renderFocus = (state) => {
  if (!state.focus) {
    el.focus.hidden = true
    return
  }

  const drill = DRILL_BY_KEY[state.focus]
  el.focus.hidden = false
  el.focusText.textContent = `${drill.label} だけを出題中 — ${drill.title}`
}

const renderDrillTable = (tbody, state, drills, onFocus) => {
  tbody.innerHTML = ''

  for (const drill of drills) {
    const { asked } = state.byDrill[drill.key]
    const rate = drillRate(state, drill.key)

    const row = document.createElement('tr')
    row.className = `drill-row${state.focus === drill.key ? ' focused' : ''}`
    row.addEventListener('click', () => onFocus(drill.key))

    const cells = [
      drill.label,
      String(asked),
      `${drill.foldBaseline.toFixed(0)}%`,
      rate === null ? '-' : `${(rate * 100).toFixed(0)}%`,
    ]

    cells.forEach((text, i) => {
      const td = document.createElement('td')
      td.textContent = text
      if (i === 2) td.className = 'baseline'
      if (i === 3 && rate !== null) td.className = rateClass(rate, drill.foldBaseline)
      row.appendChild(td)
    })

    tbody.appendChild(row)
  }
}

const renderSpark = (state) => {
  el.spark.innerHTML = ''

  const points = rollingAccuracy(state.history)
  const y = (value) => SPARK_H - SPARK_PAD - value * (SPARK_H - SPARK_PAD * 2)

  el.spark.appendChild(svg('line', { class: 'spark-base', x1: 0, y1: y(0), x2: SPARK_W, y2: y(0) }))
  el.spark.appendChild(
    svg('line', { class: 'spark-target', x1: 0, y1: y(TARGET_RATE), x2: SPARK_W, y2: y(TARGET_RATE) }),
  )

  if (points.length < 2) {
    const remaining = Math.max(0, SPARK_WINDOW + 1 - state.history.length)
    el.spark.appendChild(
      svg(
        'text',
        { class: 'spark-empty', x: SPARK_W / 2, y: SPARK_H / 2 + 4 },
        `あと ${remaining} 問で推移グラフが出ます`,
      ),
    )
    return
  }

  const step = SPARK_W / (points.length - 1)
  const path = points.map((value, i) => `${(i * step).toFixed(1)},${y(value).toFixed(1)}`).join(' ')
  el.spark.appendChild(svg('polyline', { class: 'spark-line', points: path }))
}

// 苦手ハンド (一度間違えて、まだ取り返せていない手)。タップでそのスポットを狙い撃ち。
const renderWeakHands = (state, onFocus) => {
  const weak = weakHands(state).slice(0, 8)

  if (weak.length === 0) {
    el.weakHandsBox.hidden = true
    return
  }

  el.weakHandsBox.hidden = false
  el.weakHandList.innerHTML = ''

  for (const item of weak) {
    const drill = DRILL_BY_KEY[item.drillKey]
    const row = document.createElement('li')
    row.className = 'weak-hand'
    row.textContent = `${drill.label} の ${item.hand} — ${item.asked} 回中 ${item.wrong} 回ミス`
    row.addEventListener('click', () => onFocus(item.drillKey))
    el.weakHandList.appendChild(row)
  }
}

// ---- ミス履歴 ----
// 間違えた問題を新しい順に一覧する。行を開くと「なぜ」と「覚え方」がその場で読める。
// 復習キュー (消費されて消える) と違い、これは残り続ける振り返り用。

const MISS_LOG_SHOWN = 50

// '2026-07-18' → '7/18'
const fmtMissDate = (dateKey) => {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${month}/${day}`
}

const missLogRow = (state, entry) => {
  const drill = DRILL_BY_KEY[entry.drillKey]

  const item = document.createElement('details')
  item.className = 'faq-item'

  const summary = document.createElement('summary')
  const handText = entry.hand === null ? 'サイズ' : entry.hand
  summary.textContent = `${fmtMissDate(entry.d)} · ${drill.label} · ${handText} — ${actionLabelOf(drill, entry.chosen)} と答えた (正解 ${actionLabelOf(drill, entry.correct)})`
  item.appendChild(summary)

  // 開いたときの中身は、間違えた時のコーチと同じ「なぜ」+「覚え方」(用語リンク付き)
  const advice = coachFor(drill, entry.hand, state.easyMode)

  const why = document.createElement('p')
  why.className = 'faq-answer'
  const whyLabel = document.createElement('strong')
  whyLabel.textContent = 'なぜ: '
  why.appendChild(whyLabel)
  const whyText = document.createElement('span')
  renderTermText(whyText, advice.why)
  why.appendChild(whyText)
  item.appendChild(why)

  const tip = document.createElement('p')
  tip.className = 'mistake-fix'
  const tipLabel = document.createElement('strong')
  tipLabel.textContent = '覚え方: '
  tip.appendChild(tipLabel)
  const tipText = document.createElement('span')
  renderTermText(tipText, advice.tip)
  tip.appendChild(tipText)
  item.appendChild(tip)

  return item
}

const renderMissLog = (state) => {
  el.missLogCount.textContent = String(state.missLog.length)
  el.missLogBody.innerHTML = ''

  if (state.missLog.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'glossary-empty'
    empty.textContent = 'まだミスがありません。間違えるとここに残ります。'
    el.missLogBody.appendChild(empty)
    el.missLogNote.hidden = true
    return
  }

  const entries = [...state.missLog].reverse().slice(0, MISS_LOG_SHOWN)
  for (const entry of entries) el.missLogBody.appendChild(missLogRow(state, entry))

  el.missLogNote.hidden = state.missLog.length <= MISS_LOG_SHOWN
}

const renderLeaks = (state) => {
  const tendency = overallTendency(state)
  const leaks = findLeaks(state)

  if (!tendency && leaks.length === 0) {
    el.leaks.hidden = true
    return
  }

  el.leaks.hidden = false
  el.leakTendency.textContent = tendency || ''
  el.leakTendency.style.display = tendency ? '' : 'none'

  el.leakList.innerHTML = ''
  for (const leak of leaks) {
    const item = document.createElement('li')
    item.textContent = leak.text
    el.leakList.appendChild(item)
  }
}

const renderSound = (state) => {
  el.sound.textContent = `効果音: ${state.soundOn ? 'ON' : 'OFF'}`
}

const renderEasy = (state) => {
  el.easy.textContent = `説明: ${state.easyMode ? 'やさしく' : 'くわしく'}`
  el.easy.classList.toggle('on', state.easyMode)
}

// ---- 成績カード全体 ----

const renderDashboard = (state, onFocus) => {
  renderDrillTable(el.statsRfi, state, RFI_DRILLS, onFocus)
  renderDrillTable(el.statsVs, state, VS_RFI_DRILLS, onFocus)
  renderDrillTable(el.statsSizing, state, SIZING_DRILLS, onFocus)
  renderFocus(state)
  renderSpark(state)
  renderLeaks(state)
  renderWeakHands(state, onFocus)
  renderMissLog(state)
  renderSound(state)
  renderEasy(state)
  renderStreak(state)
}
