// DOM 描画。状態を受け取って描くだけで、状態は書き換えない。

const STREAK_HOT = 5
const SPARK_W = 320
const SPARK_H = 56
const SPARK_PAD = 4

// 座席の描画位置 (プリフロップの行動順に時計回り)
const SEAT_XY = {
  UTG: [66, 71],
  HJ: [170, 37],
  CO: [274, 71],
  BTN: [274, 139],
  SB: [170, 173],
  BB: [66, 139],
}

const ACTION_COLORS = {
  raise: 'act-raise',
  threebet: 'act-threebet',
  call: 'act-call',
  fold: 'act-fold',
}

const ACTION_LABELS = {
  raise: 'レイズ',
  threebet: '3ベット',
  call: 'コール',
  fold: 'フォールド',
}

// サイズのドリルは action の id がそのまま額 ('7.5bb') なので、固定表からは引けない。
// ドリル自身が持つ action の label を先に見る。
const actionLabelOf = (drill, actionId) => {
  const action = drill.actions.find((a) => a.id === actionId)
  return action ? action.label : ACTION_LABELS[actionId]
}

const el = {
  modes: document.getElementById('modes'),
  modeHint: document.getElementById('mode-hint'),
  focus: document.getElementById('focus'),
  focusText: document.getElementById('focus-text'),
  focusClear: document.getElementById('focus-clear'),
  prompt: document.getElementById('prompt'),
  table: document.getElementById('table'),
  spotTitle: document.getElementById('spot-title'),
  spotNote: document.getElementById('spot-note'),
  streak: document.getElementById('streak'),
  streakCurrent: document.getElementById('streak-current'),
  streakBest: document.getElementById('streak-best'),
  cards: document.getElementById('cards'),
  hand: document.getElementById('hand'),
  combos: document.getElementById('combos'),
  actions: document.getElementById('actions'),
  next: document.getElementById('btn-next'),
  reset: document.getElementById('btn-reset'),
  sound: document.getElementById('btn-sound'),
  verdict: document.getElementById('verdict'),
  chart: document.getElementById('chart'),
  daily: document.getElementById('daily'),
  dailyList: document.getElementById('daily-list'),
  dailyStreak: document.getElementById('daily-streak'),
  dailyDone: document.getElementById('daily-done'),
  statsSizing: document.getElementById('stats-sizing'),
  glossarySearch: document.getElementById('glossary-search'),
  glossaryBody: document.getElementById('glossary-body'),
  glossaryCount: document.getElementById('glossary-count'),
  banner: document.getElementById('banner'),
  bannerMark: document.getElementById('banner-mark'),
  bannerText: document.getElementById('banner-text'),
  verdictNote: document.getElementById('verdict-note'),
  coach: document.getElementById('coach'),
  coachWhy: document.getElementById('coach-why'),
  coachTip: document.getElementById('coach-tip'),
  grid: document.getElementById('grid'),
  legend: document.getElementById('legend'),
  statsRfi: document.getElementById('stats-rfi'),
  statsVs: document.getElementById('stats-vs'),
  spark: document.getElementById('spark'),
  leaks: document.getElementById('leaks'),
  leakTendency: document.getElementById('leak-tendency'),
  leakList: document.getElementById('leak-list'),
  helpRanges: document.getElementById('help-ranges'),
  boundaryCount: document.getElementById('boundary-count'),
  steps: document.getElementById('steps'),
  growthGrid: document.getElementById('growth-grid'),
  growthNote: document.getElementById('growth-note'),
  refRfi: document.getElementById('ref-rfi'),
  refVs: document.getElementById('ref-vs'),
  refTitle: document.getElementById('ref-title'),
  refNote: document.getElementById('ref-note'),
  refStats: document.getElementById('ref-stats'),
  refGrid: document.getElementById('ref-grid'),
  refLegend: document.getElementById('ref-legend'),
  refPrompt: document.getElementById('ref-prompt'),
  refAnswer: document.getElementById('ref-answer'),
  refAnswerHead: document.getElementById('ref-answer-head'),
  refAnswerWhy: document.getElementById('ref-answer-why'),
  refAnswerTip: document.getElementById('ref-answer-tip'),
  faqSearch: document.getElementById('faq-search'),
  faqBody: document.getElementById('faq-body'),
  faqCount: document.getElementById('faq-count'),
}

const NS = 'http://www.w3.org/2000/svg'

const svg = (tag, attrs, text) => {
  const node = document.createElementNS(NS, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  if (text !== undefined) node.textContent = text
  return node
}

// ---- モード ----

const renderModes = (state, onSelect) => {
  el.modes.innerHTML = ''
  for (const mode of MODES) {
    const button = document.createElement('button')
    button.className = `mode-btn${mode.id === state.mode ? ' active' : ''}`
    button.textContent = mode.label
    button.addEventListener('click', () => onSelect(mode.id))
    el.modes.appendChild(button)
  }

  const active = MODE_BY_ID[state.mode]
  el.modeHint.textContent = active.boundaryOnly
    ? `${active.hint} 対象は ${BOUNDARY_HANDS.length} ハンド。`
    : active.hint
}

// ---- テーブル (実戦シミュレーション) ----
//
// ドリルから各席の状態を決める。レイザーより前は降り、レイザーとヒーローの間も降りている。
const seatStateFor = (drill, positionId) => {
  const seat = POSITION_INDEX[positionId]
  const hero = POSITION_INDEX[drill.hero]
  if (seat === hero) return 'hero'
  if (drill.raiser && positionId === drill.raiser) return 'raiser'
  if (seat < hero) return 'folded'
  return 'waiting'
}

const renderTable = (drill) => {
  el.table.innerHTML = ''

  el.table.appendChild(svg('ellipse', { class: 'felt-bg', cx: 170, cy: 105, rx: 120, ry: 68 }))

  const potLine = drill.raiser
    ? `${drill.raiser} が ${raiseSizeFor(drill.raiser)} にレイズ`
    : '全員フォールド'

  // ポットを常に出す。「7.5bb」がいくらなのかは、卓にいくら落ちているかを見ないと掴めない。
  const potText = `ポット ${fmtBb(potBefore(drill))}`

  el.table.appendChild(svg('text', { class: 'felt-text', x: 170, y: 98 }, potLine))
  el.table.appendChild(svg('text', { class: 'felt-pot', x: 170, y: 112 }, potText))
  el.table.appendChild(svg('text', { class: 'felt-text', x: 170, y: 124 }, 'あなたの番'))

  for (const position of POSITIONS) {
    const [x, y] = SEAT_XY[position.id]
    const seatState = seatStateFor(drill, position.id)

    const group = svg('g', { class: `seat seat-${seatState}` })
    group.appendChild(svg('circle', { class: 'seat-ring', cx: x, cy: y, r: 22 }))
    group.appendChild(svg('text', { class: 'seat-label', x, y: y + 1 }, position.label))

    const tag =
      seatState === 'hero'
        ? 'YOU'
        : seatState === 'raiser'
          ? 'RAISE'
          : seatState === 'folded'
            ? 'fold'
            : ''
    if (tag) group.appendChild(svg('text', { class: 'seat-tag', x, y: y + 12 }, tag))

    el.table.appendChild(group)
  }
}

// ---- カード ----

const renderCards = (hand) => {
  el.cards.innerHTML = ''
  for (const card of dealCards(hand)) {
    const node = document.createElement('div')
    node.className = `playing-card ${card.suit.color}`

    const corner = document.createElement('div')
    corner.className = 'corner'
    corner.textContent = card.rank

    const pip = document.createElement('span')
    pip.className = 'pip'
    pip.textContent = card.suit.glyph
    corner.appendChild(pip)

    const center = document.createElement('div')
    center.className = 'center'
    center.textContent = card.suit.glyph

    node.appendChild(corner)
    node.appendChild(center)
    el.cards.appendChild(node)
  }
}

const describeHand = (hand) => {
  if (isPair(hand)) return 'ポケットペア / 6 combos'
  return isSuited(hand) ? 'スーテッド / 4 combos' : 'オフスーツ / 12 combos'
}

const renderStreak = (state) => {
  const { current, best } = state.streak
  el.streakCurrent.textContent = String(current)
  el.streakBest.textContent = best > 0 ? `最高 ${best}` : ''
  el.streak.classList.toggle('hot', current >= STREAK_HOT)
}

// ---- 出題 ----

const renderActions = (drill, onAnswer) => {
  el.actions.innerHTML = ''
  for (const action of drill.actions) {
    const button = document.createElement('button')
    button.className = `action-btn tone-${action.tone}`
    button.dataset.action = action.id

    const label = document.createElement('span')
    label.textContent = action.label
    button.appendChild(label)

    // サイズの選択肢には「実際に手元から出る額」を添える。
    // ブラインドはすでに払い込んでいるので、10bb にするのに 10bb 出すわけではない。
    if (action.tone === 'size') {
      const sub = document.createElement('span')
      sub.className = 'action-sub'
      sub.textContent = `追加 ${fmtBb(chipsToPut(drill, action.id))}`
      button.appendChild(sub)
    }

    const key = document.createElement('span')
    key.className = 'key'
    key.textContent = action.hotkey.toUpperCase()
    button.appendChild(key)

    button.addEventListener('click', () => onAnswer(action.id))
    el.actions.appendChild(button)
  }
}

const setActionsDisabled = (disabled) => {
  for (const button of el.actions.children) button.disabled = disabled
}

// 答え合わせを押したボタンの上でやる。視線を動かさずに正誤が分かるようにするため。
const markActions = (chosenAction, correctAction) => {
  for (const button of el.actions.children) {
    const id = button.dataset.action
    button.classList.remove('is-correct', 'is-wrong', 'is-muted')

    if (id === correctAction) button.classList.add('is-correct')
    else if (id === chosenAction) button.classList.add('is-wrong')
    else button.classList.add('is-muted')
  }
}

const clearActionMarks = () => {
  for (const button of el.actions.children) {
    button.classList.remove('is-correct', 'is-wrong', 'is-muted')
  }
}

// サイズの出題はカードを配らない。額はハンドに依存しないので、
// カードを見せると「手によって額が変わる」という誤った印象を与える。
const renderHandArea = (drill, hand) => {
  if (drill.type === 'sizing') {
    el.cards.innerHTML = ''
    el.cards.hidden = true
    el.hand.innerHTML = ''
    el.hand.textContent = drill.raiser ? '3ベットする' : 'オープンレイズする'
    // 持ち金を出しておく。「7.5bb」は 100bb スタックの 7.5% だと分かって初めて額として掴める。
    el.combos.textContent = `いくらにする？ 持ち金 ${STACK_BB}bb / ポット ${fmtBb(potBefore(drill))} (額は手に依存しない)`
    return
  }

  el.cards.hidden = false
  renderCards(hand)

  el.hand.innerHTML = ''
  const base = document.createElement('span')
  base.textContent = isPair(hand) ? hand : hand.slice(0, 2)
  el.hand.appendChild(base)
  if (!isPair(hand)) {
    const suffix = document.createElement('span')
    suffix.className = 'suffix'
    suffix.textContent = hand[2]
    el.hand.appendChild(suffix)
  }

  el.combos.textContent = describeHand(hand)
}

const renderQuestion = (state, question, onAnswer) => {
  const drill = DRILL_BY_KEY[question.drillKey]

  renderTable(drill)
  el.spotTitle.textContent = drill.title
  el.spotNote.textContent = question.isReview ? `${drill.note} — 復習` : drill.note

  renderHandArea(drill, question.hand)

  renderActions(drill, onAnswer)
  clearActionMarks()
  renderStreak(state)
  el.verdict.hidden = true
}

// ---- 判定 ----

// onPick を渡すとマスがタップできるようになる (定石ビューアの「この手なんで？」)。
const renderGridInto = (target, drill, currentHand = null, onPick = null) => {
  target.innerHTML = ''
  for (const hand of ALL_HANDS) {
    const action = drill.answerFor(hand)
    const cell = document.createElement('div')
    cell.className = `cell ${ACTION_COLORS[action]}`
    if (currentHand !== null && hand === currentHand) cell.classList.add('current')
    cell.textContent = hand
    if (onPick) {
      cell.classList.add('pickable')
      cell.addEventListener('click', () => onPick(hand))
    }
    target.appendChild(cell)
  }
}

const renderLegendInto = (target, drill) => {
  target.innerHTML = ''
  const actions = [...drill.actions.map((a) => a.id)]
  if (!actions.includes('fold')) actions.push('fold')

  for (const action of actions) {
    const item = document.createElement('span')
    const swatch = document.createElement('span')
    swatch.className = `swatch ${ACTION_COLORS[action]}`
    item.appendChild(swatch)
    item.appendChild(document.createTextNode(ACTION_LABELS[action]))
    target.appendChild(item)
  }
}

const renderGrid = (drill, currentHand) => renderGridInto(el.grid, drill, currentHand)
const renderLegend = (drill) => renderLegendInto(el.legend, drill)

const verdictHeadline = (drill, question, grade, chosenAction) => {
  const correctLabel = actionLabelOf(drill, grade.correctAction)
  const chosenLabel = actionLabelOf(drill, chosenAction)

  if (grade.isCorrect) {
    return drill.type === 'sizing' ? `${drill.label} は ${correctLabel}` : `${question.hand} は ${correctLabel}`
  }
  return `${chosenLabel} ではなく ${correctLabel}`
}

const verdictNoteText = (drill, question, grade) => {
  const correctLabel = actionLabelOf(drill, grade.correctAction)

  // サイズは「その数字が実際に何を意味するか」まで書かないと、bb が最後まで抽象のままになる。
  if (drill.type === 'sizing') {
    const size = bbValue(grade.correctAction)
    const pot = potBefore(drill)
    const put = chipsToPut(drill, grade.correctAction)
    const posted = postedBy(drill.hero)

    const chips =
      posted > 0
        ? `すでに出している ${fmtBb(posted)} に ${fmtBb(put)} 足して ${correctLabel}`
        : `手元から ${fmtBb(put)} 出す`

    return `${fmtBb(pot)} 入っているポットを取りに ${correctLabel} — ${chips}。持ち金 ${STACK_BB}bb の ${((size / STACK_BB) * 100).toFixed(1)}%、ポットの ${(size / pot).toFixed(1)} 倍。`
  }

  const share =
    grade.correctAction === 'fold'
      ? `このスポットで降りる手は全体の ${drill.foldBaseline.toFixed(0)}%。`
      : `このスポットで ${correctLabel} する手は全体の ${pctOf(drill.sets[grade.correctAction]).toFixed(0)}%。`

  return `${drill.label} で ${question.hand} は ${correctLabel}。${share}`
}

const renderVerdict = (question, grade, chosenAction) => {
  const drill = DRILL_BY_KEY[question.drillKey]

  el.banner.className = `banner ${grade.isCorrect ? 'ok' : 'ng'}`
  el.bannerMark.textContent = grade.isCorrect ? '正解' : '不正解'
  el.bannerText.textContent = verdictHeadline(drill, question, grade, chosenAction)
  el.verdictNote.textContent = verdictNoteText(drill, question, grade)

  // 間違えた時だけ、バナー直下に「なぜ」と「覚え方」を出す。正解時は次の問題への流れを止めない。
  if (grade.isCorrect) {
    el.coach.hidden = true
  } else {
    const advice = coachFor(drill, question.hand)
    el.coachWhy.textContent = advice.why
    el.coachTip.textContent = advice.tip
    el.coach.hidden = false
  }

  markActions(chosenAction, grade.correctAction)

  // レンジ表はハンドの表なので、サイズの出題では意味がない。
  el.chart.hidden = drill.type === 'sizing'
  if (drill.type !== 'sizing') {
    renderGrid(drill, question.hand)
    renderLegend(drill)
  }

  setActionsDisabled(true)
  el.verdict.hidden = false

  el.prompt.classList.remove('flash-correct', 'flash-wrong')
  // reflow を挟まないと同じクラスの再付与でアニメーションが再生されない。
  void el.prompt.offsetWidth
  el.prompt.classList.add(grade.isCorrect ? 'flash-correct' : 'flash-wrong')

  el.next.focus()
}

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

// ---- レンジの育ち方 ----

// 増えた手を数える時は combos ではなくハンド数で言う (「表のマスがいくつ増えたか」の話なので)。
const describeStep = (step) => {
  const added = step.added.size
  const removed = step.removed.size

  if (!step.from) {
    return `${step.hero} は最も狭い出発点。${step.range.size} ハンド (上位 ${step.pct.toFixed(0)}%) から始まる。`
  }

  const base = `${step.from} → ${step.hero}: ${added} ハンド増えて ${step.range.size} ハンド (上位 ${step.pct.toFixed(0)}%)。`

  if (removed === 0) return base

  const dropped = [...step.removed].join(', ')
  return `${base} ただし ${removed} ハンドが消える (${dropped})。SB は BTN の上位互換ではない — 後ろほど広い、と単純化して覚えないこと。`
}

const renderGrowthGrid = (step) => {
  el.growthGrid.innerHTML = ''

  for (const hand of ALL_HANDS) {
    const cell = document.createElement('div')
    cell.className = 'cell'

    if (step.added.has(hand)) cell.classList.add('grow-added')
    else if (step.removed.has(hand)) cell.classList.add('grow-removed')
    else if (step.range.has(hand)) cell.classList.add('grow-in')
    else cell.classList.add('act-fold')

    cell.textContent = hand
    el.growthGrid.appendChild(cell)
  }
}

const renderGrowth = (stepIndex, onSelect) => {
  const step = RFI_STEPS[stepIndex]

  el.steps.innerHTML = ''
  RFI_STEPS.forEach((candidate, index) => {
    const button = document.createElement('button')
    button.className = `step-btn${index === stepIndex ? ' active' : ''}`
    button.textContent = candidate.hero
    button.addEventListener('click', () => onSelect(index))
    el.steps.appendChild(button)
  })

  renderGrowthGrid(step)
  el.growthNote.textContent = describeStep(step)
}

// ---- 毎日の特訓メニュー ----

const renderDailyTask = (task, onStart) => {
  const row = document.createElement('button')
  row.className = `daily-task${task.isComplete ? ' complete' : ''}`
  row.dataset.task = task.id
  row.addEventListener('click', () => onStart(task))

  const mark = document.createElement('span')
  mark.className = 'daily-mark'
  mark.textContent = task.isComplete ? '✓' : '▶'
  row.appendChild(mark)

  const body = document.createElement('span')
  body.className = 'daily-main'

  const label = document.createElement('span')
  label.className = 'daily-label'
  label.textContent = task.label
  body.appendChild(label)

  const hint = document.createElement('span')
  hint.className = 'daily-hint'
  hint.textContent = task.hint
  body.appendChild(hint)

  const bar = document.createElement('span')
  bar.className = 'daily-bar'
  const fill = document.createElement('span')
  fill.className = 'daily-fill'
  fill.style.width = `${(task.done / task.target) * 100}%`
  bar.appendChild(fill)
  body.appendChild(bar)

  row.appendChild(body)

  const count = document.createElement('span')
  count.className = 'daily-count'
  count.textContent = `${task.done}/${task.target}`
  row.appendChild(count)

  return row
}

const renderDaily = (state, onStart) => {
  const tasks = dailyTasks(state)

  el.dailyList.innerHTML = ''
  for (const task of tasks) el.dailyList.appendChild(renderDailyTask(task, onStart))

  const days = state.dailyStreak.days
  el.dailyStreak.textContent = days > 0 ? `${days} 日連続` : ''

  const complete = tasks.every((task) => task.isComplete)
  el.dailyDone.hidden = !complete
  el.daily.classList.toggle('all-done', complete)
}

// ---- 用語解説 ----

const renderGlossary = (query = '') => {
  const groups = searchGlossary(query)
  el.glossaryCount.textContent = String(GLOSSARY_TERM_COUNT)
  el.glossaryBody.innerHTML = ''

  if (groups.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'glossary-empty'
    empty.textContent = `「${query}」に当たる用語はありません。`
    el.glossaryBody.appendChild(empty)
    return
  }

  for (const group of groups) {
    const heading = document.createElement('h3')
    heading.textContent = group.section
    el.glossaryBody.appendChild(heading)

    const list = document.createElement('dl')
    list.className = 'glossary-list'
    for (const entry of group.terms) {
      const term = document.createElement('dt')
      term.textContent = entry.term
      const def = document.createElement('dd')
      def.textContent = entry.def
      list.appendChild(term)
      list.appendChild(def)
    }
    el.glossaryBody.appendChild(list)
  }
}

// ---- 定石ビューア ----

// 出題を待たずにチャートを眺めるためのカード。数字は sets から都度計算する (正本とずらさない)。
const refStatsText = (drill) => {
  if (drill.type === 'rfi') {
    return `レイズ ${pctOf(drill.sets.raise).toFixed(0)}% (${drill.sets.raise.size} ハンド) / フォールド ${drill.foldBaseline.toFixed(0)}%`
  }

  const threebetPart = `3ベット ${pctOf(drill.sets.threebet).toFixed(1)}% (${drill.sets.threebet.size} ハンド)`
  const callPart =
    drill.sets.call.size > 0
      ? `コール ${pctOf(drill.sets.call).toFixed(1)}% (${drill.sets.call.size} ハンド)`
      : 'コールなし (3ベット・オア・フォールド)'
  return `${threebetPart} / ${callPart} / フォールド ${drill.foldBaseline.toFixed(0)}%`
}

const renderRefButtons = (container, drills, selectedKey, onSelect, labelOf) => {
  container.innerHTML = ''
  for (const drill of drills) {
    const button = document.createElement('button')
    button.className = `step-btn${drill.key === selectedKey ? ' active' : ''}`
    button.textContent = labelOf(drill)
    button.addEventListener('click', () => onSelect(drill.key))
    container.appendChild(button)
  }
}

// マスをタップしたときの「この手はなぜ？」。
// 出題を待たなくても、19 スポット × 169 ハンドのどれでもコーチ文を引ける。
const renderRefAnswer = (drill, hand) => {
  if (!hand) {
    el.refAnswer.hidden = true
    el.refPrompt.hidden = false
    return
  }

  const action = drill.answerFor(hand)
  const advice = coachFor(drill, hand)

  el.refPrompt.hidden = true
  el.refAnswer.hidden = false
  el.refAnswer.className = `ref-answer ${ACTION_COLORS[action]}-tint`

  el.refAnswerHead.textContent = `${drill.label} で ${hand} は ${ACTION_LABELS[action]}`
  el.refAnswerWhy.textContent = advice.why
  el.refAnswerTip.textContent = advice.tip
}

const renderReference = (selectedKey, pickedHand, onSelect, onPick) => {
  const drill = DRILL_BY_KEY[selectedKey]

  renderRefButtons(el.refRfi, RFI_DRILLS, selectedKey, onSelect, (d) => d.hero)
  renderRefButtons(el.refVs, VS_RFI_DRILLS, selectedKey, onSelect, (d) => d.label)

  el.refTitle.textContent = drill.title
  el.refNote.textContent = drill.note
  el.refStats.textContent = refStatsText(drill)

  renderGridInto(el.refGrid, drill, pickedHand, onPick)
  renderLegendInto(el.refLegend, drill)
  renderRefAnswer(drill, pickedHand)
}

// ---- よくある質問 ----

const renderFaq = (query = '') => {
  const entries = searchFaq(query)
  el.faqCount.textContent = String(FAQ.length)
  el.faqBody.innerHTML = ''

  if (entries.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'glossary-empty'
    empty.textContent = `「${query}」に当たる質問はありません。`
    el.faqBody.appendChild(empty)
    return
  }

  for (const entry of entries) {
    const item = document.createElement('details')
    item.className = 'faq-item'

    const question = document.createElement('summary')
    question.textContent = entry.q
    item.appendChild(question)

    const answer = document.createElement('p')
    answer.className = 'faq-answer'
    answer.textContent = entry.a
    item.appendChild(answer)

    el.faqBody.appendChild(item)
  }
}

const renderHelp = () => {
  el.helpRanges.innerHTML = ''
  for (const drill of RFI_DRILLS) {
    const position = positionOf(drill.hero)
    const row = document.createElement('tr')
    for (const text of [
      position.label,
      position.character,
      `${(100 - drill.foldBaseline).toFixed(0)}%`,
    ]) {
      const td = document.createElement('td')
      td.textContent = text
      row.appendChild(td)
    }
    el.helpRanges.appendChild(row)
  }
  el.boundaryCount.textContent = String(BOUNDARY_HANDS.length)
}

const renderDashboard = (state, onFocus) => {
  renderDrillTable(el.statsRfi, state, RFI_DRILLS, onFocus)
  renderDrillTable(el.statsVs, state, VS_RFI_DRILLS, onFocus)
  renderDrillTable(el.statsSizing, state, SIZING_DRILLS, onFocus)
  renderFocus(state)
  renderSpark(state)
  renderLeaks(state)
  renderSound(state)
  renderStreak(state)
}
