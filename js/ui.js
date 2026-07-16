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
  easy: document.getElementById('btn-easy'),
  intro: document.getElementById('intro'),
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
  mistakesBody: document.getElementById('mistakes-body'),
  mistakesCount: document.getElementById('mistakes-count'),
  equityGrid: document.getElementById('equity-grid'),
  equityPrompt: document.getElementById('equity-prompt'),
  equityAnswer: document.getElementById('equity-answer'),
  sheet: document.getElementById('sheet'),
  sheetFab: document.getElementById('sheet-fab'),
  sheetTabs: document.getElementById('sheet-tabs'),
  sheetBody: document.getElementById('sheet-body'),
  sheetClose: document.getElementById('sheet-close'),
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
  const hint = state.easyMode ? active.easyHint : active.hint
  el.modeHint.textContent = active.boundaryOnly ? `${hint} 対象は ${BOUNDARY_HANDS.length} ハンド。` : hint
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

const renderTable = (drill, onSeatTap = null) => {
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

    const group = svg('g', { class: `seat seat-${seatState}${onSeatTap ? ' seat-tappable' : ''}` })
    // 席をタップすると早見表のポジションのタブが開く (初心者が席の意味をすぐ引けるように)
    if (onSeatTap) group.addEventListener('click', () => onSeatTap(position.id))
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

const renderQuestion = (state, question, onAnswer, onSeatTap = null) => {
  const drill = DRILL_BY_KEY[question.drillKey]

  renderTable(drill, onSeatTap)
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

const renderVerdict = (state, question, grade, chosenAction) => {
  const drill = DRILL_BY_KEY[question.drillKey]

  el.banner.className = `banner ${grade.isCorrect ? 'ok' : 'ng'}`
  el.bannerMark.textContent = grade.isCorrect ? '正解' : '不正解'
  el.bannerText.textContent = verdictHeadline(drill, question, grade, chosenAction)
  el.verdictNote.textContent = verdictNoteText(drill, question, grade)

  // 間違えた時だけ、バナー直下に「なぜ」と「覚え方」を出す。正解時は次の問題への流れを止めない。
  if (grade.isCorrect) {
    el.coach.hidden = true
  } else {
    const advice = coachFor(drill, question.hand, state.easyMode)
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

const renderEasy = (state) => {
  el.easy.textContent = `説明: ${state.easyMode ? 'やさしく' : 'くわしく'}`
  el.easy.classList.toggle('on', state.easyMode)
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

// 用語集の本体。用語カードと早見表の用語タブの両方から使う。
const buildGlossaryInto = (container, query) => {
  const groups = searchGlossary(query)
  container.innerHTML = ''

  if (groups.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'glossary-empty'
    empty.textContent = `「${query}」に当たる用語はありません。`
    container.appendChild(empty)
    return
  }

  for (const group of groups) {
    const heading = document.createElement('h3')
    heading.textContent = group.section
    container.appendChild(heading)

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
    container.appendChild(list)
  }
}

const renderGlossary = (query = '') => {
  el.glossaryCount.textContent = String(GLOSSARY_TERM_COUNT)
  buildGlossaryInto(el.glossaryBody, query)
}

// ---- よくあるミスとコツ ----

const renderMistakes = () => {
  el.mistakesCount.textContent = String(MISTAKES.length)
  el.mistakesBody.innerHTML = ''

  for (const mistake of MISTAKES) {
    const item = document.createElement('details')
    item.className = 'faq-item'

    const title = document.createElement('summary')
    title.textContent = mistake.title
    item.appendChild(title)

    const why = document.createElement('p')
    why.className = 'faq-answer'
    const whyLabel = document.createElement('strong')
    whyLabel.textContent = 'なぜまずい: '
    why.appendChild(whyLabel)
    why.appendChild(document.createTextNode(mistake.why))
    item.appendChild(why)

    const fix = document.createElement('p')
    fix.className = 'mistake-fix'
    const fixLabel = document.createElement('strong')
    fixLabel.textContent = 'どうする: '
    fix.appendChild(fixLabel)
    fix.appendChild(document.createTextNode(mistake.fix))
    item.appendChild(fix)

    el.mistakesBody.appendChild(item)
  }
}

// ---- 勝率表 (期待値の土台) ----

// 対ランダム勝率をヒートマップにする。バケツは見た目のためだけの区切り。
const equityClass = (pct) => {
  if (pct >= 64) return 'eq-4'
  if (pct >= 57) return 'eq-3'
  if (pct >= 50) return 'eq-2'
  if (pct >= 42) return 'eq-1'
  return 'eq-0'
}

const equityAnswerText = (hand) => {
  const equity = EQUITY_VS_RANDOM[hand]
  const openers = rfiOpeners(hand)
  const openLine =
    openers.length === 0
      ? 'どの席からも開けない'
      : openers.length === RFI_DRILLS.length
        ? '全席で開ける'
        : `${openers[0]} から開ける`

  const lines = [
    `${hand}: 対ランダム勝率 ${equity.toFixed(1)}% (${describeHand(hand)})`,
    `RFI では ${openLine}。`,
  ]

  // 勝率とレンジ表の食い違いこそが「期待値は勝率だけでは決まらない」の教材
  if (equity >= 50 && openers.length === 0) {
    lines.push(
      `勝率は五分以上あるのに、どこからも開けない。ドミネートされやすく、良いペアができても稼げず悪い場面で払わされる — 勝率を実現しにくい手の典型。`,
    )
  } else if (equity < 50 && openers.length > 0) {
    lines.push(
      `勝率は五分未満なのに開けられる。そろい・つながりで大きな役に化けやすく、勝つときに大きく取れる — 勝率の数字より実戦で強い手の典型。`,
    )
  }

  return lines.join(' ')
}

const renderEquity = (pickedHand, onPick) => {
  el.equityGrid.innerHTML = ''
  for (const hand of ALL_HANDS) {
    const cell = document.createElement('div')
    cell.className = `cell pickable ${equityClass(EQUITY_VS_RANDOM[hand])}`
    if (pickedHand === hand) cell.classList.add('current')
    cell.textContent = hand
    cell.addEventListener('click', () => onPick(hand))
    el.equityGrid.appendChild(cell)
  }

  el.equityPrompt.hidden = pickedHand !== null
  el.equityAnswer.hidden = pickedHand === null
  el.equityAnswer.textContent = pickedHand ? equityAnswerText(pickedHand) : ''
}

// ---- 早見表 (右下のボタンからいつでも開けるシート) ----

const SHEET_PANES = [
  { id: 'positions', label: 'ポジション' },
  { id: 'blinds', label: 'SB / BB' },
  { id: 'size', label: 'サイズ' },
  { id: 'mantra', label: '合言葉' },
  { id: 'glossary', label: '用語' },
]

const sheetHeading = (text) => {
  const heading = document.createElement('h3')
  heading.className = 'sheet-h'
  heading.textContent = text
  return heading
}

const sheetNote = (text) => {
  const note = document.createElement('p')
  note.className = 'sheet-note'
  note.textContent = text
  return note
}

const sheetTable = (headers, rows) => {
  const table = document.createElement('table')
  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  for (const header of headers) {
    const th = document.createElement('th')
    th.textContent = header
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  for (const row of rows) {
    const tr = document.createElement('tr')
    for (const cellText of row) {
      const td = document.createElement('td')
      td.textContent = cellText
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  return table
}

const sheetPositionsPane = (body) => {
  body.appendChild(sheetHeading('席は行動する順番 (毎ハンド 1 つずつ回る)'))
  body.appendChild(
    sheetTable(
      ['席', '正式名', '後ろ', '開く%', 'ひとこと'],
      POSITIONS.map((position) => {
        const rfi = DRILL_BY_KEY[`RFI_${position.id}`]
        return [
          position.label,
          position.full,
          `${playersBehind(position.id)} 人`,
          rfi ? `${(100 - rfi.foldBaseline).toFixed(0)}%` : '—',
          position.character,
        ]
      }),
    ),
  )
  body.appendChild(
    sheetNote('後ろの人数が少ないほど「自分が一番強い」確率が上がる → 後ろの席ほど広く開ける。'),
  )
  body.appendChild(
    sheetNote(
      `例外は SB。プリフロップでは後ろ 1 人なのに、カードが開いたあとはずっと最初に動く不利な席。だから BTN では開ける ${RFI_STEPS[RFI_STEPS.length - 1].removed.size} ハンドが SB では消える。BB は全員降りれば戦わずに勝ち — だから「開く%」が無い。`,
    ),
  )
}

const sheetBlindsPane = (body) => {
  // ポットオッズの数字はデータ (BLINDS / RAISE_SIZE) から都度計算する
  const openBb = bbValue(RAISE_SIZE.DEFAULT)
  const bbCallCost = openBb - BLINDS.BB
  const potAfterCall = openBb * 2 + BLINDS.SB
  const needPct = ((bbCallCost / potAfterCall) * 100).toFixed(0)

  body.appendChild(sheetHeading('SB — 見た目より悪い席'))
  body.appendChild(
    sheetNote('出した 0.5bb は「もう自分のお金ではない」。取り返そうとして参加する理由にしない。'),
  )
  body.appendChild(
    sheetNote('カードが開いたあと、SB はずっと最初に動く = 相手に情報を渡し続ける。だからレイズされたら常に「被せるか降りるか」の二択 (コールを作らない)。後ろに BB も残っている。'),
  )
  body.appendChild(
    sheetNote(`自分から開けるときは広く (41%)、ただしサイズは 3bb (他は 2.5bb)。BB に安く見に来させないため。`),
  )

  body.appendChild(sheetHeading('BB — 世界一安く戦える席'))
  body.appendChild(
    sheetNote(
      `すでに 1bb 払っているので、${RAISE_SIZE.DEFAULT} のオープンに付いていく追加はたった ${fmtBb(bbCallCost)}。コールした後のポットは ${fmtBb(potAfterCall)} なので、${needPct}% 勝てれば元が取れる計算 (ポットオッズ)。だから他の席なら捨てる手でも守れる。`,
    ),
  )
  body.appendChild(
    sheetNote('しかもプリフロップは BB が最後 — BB が決めればその周は終わり、後ろから被せられる心配がない。'),
  )
  body.appendChild(
    sheetTable(
      ['相手のレイズ', 'BB が戦う割合'],
      ['UTG', 'HJ', 'CO', 'BTN'].map((raiser) => [
        raiser,
        `${(100 - DRILL_BY_KEY[`${raiser}_BB`].foldBaseline).toFixed(0)}%`,
      ]),
    ),
  )
  body.appendChild(
    sheetNote('相手が後ろの席ほど相手の手は弱い → BB はどんどん広く守る。ただし「安いから何でも」ではない — vs UTG では 7 割降りる。'),
  )
}

const sheetSizePane = (body) => {
  const pctOfStack = (label) => `持ち金の ${((bbValue(label) / STACK_BB) * 100).toFixed(1)}%`

  body.appendChild(sheetHeading('額は手ではなく状況で決める (変えると読まれる)'))
  body.appendChild(
    sheetTable(
      ['場面', '額', 'それは'],
      [
        ['オープン (最初のレイズ)', RAISE_SIZE.DEFAULT, pctOfStack(RAISE_SIZE.DEFAULT)],
        ['オープン (SB だけ)', RAISE_SIZE.SB, pctOfStack(RAISE_SIZE.SB)],
        [`3ベット 有利な側 (相手より後に動ける)`, THREEBET_SIZE.ip, `オープンの 3 倍 = ${pctOfStack(THREEBET_SIZE.ip)}`],
        [`3ベット 不利な側 (SB / BB)`, THREEBET_SIZE.oop, `オープンの 4 倍 = ${pctOfStack(THREEBET_SIZE.oop)}`],
      ],
    ),
  )
  body.appendChild(
    sheetNote('不利な側ほど大きくする: 位置が悪いと勝率どおりに取れないので、その前に降りてもらう確率を上げる。有利な側は安くして付いてきてもらうほうが儲かる。'),
  )
  body.appendChild(
    sheetNote(`卓には最初から ${fmtBb(BLIND_POT)} 落ちていて、誰かが ${RAISE_SIZE.DEFAULT} 開けるとポットは ${fmtBb(BLIND_POT + bbValue(RAISE_SIZE.DEFAULT))}。間にコーラーが挟まったら 1 人につき +1bb 足すのが定番の調整。`),
  )
}

const sheetMantraPane = (body) => {
  const list = document.createElement('dl')
  list.className = 'glossary-list'
  for (const mantra of MANTRAS) {
    const phrase = document.createElement('dt')
    phrase.textContent = mantra.phrase
    const note = document.createElement('dd')
    note.textContent = mantra.note
    list.appendChild(phrase)
    list.appendChild(note)
  }
  body.appendChild(list)
}

const sheetGlossaryPane = (body, query, onQuery) => {
  const input = document.createElement('input')
  input.className = 'glossary-search'
  input.type = 'search'
  input.placeholder = '用語を検索 (説明文からも引けます)'
  input.value = query
  input.addEventListener('input', () => onQuery(input.value))
  body.appendChild(input)

  const container = document.createElement('div')
  buildGlossaryInto(container, query)
  body.appendChild(container)
}

const SHEET_BUILDERS = {
  positions: sheetPositionsPane,
  blinds: sheetBlindsPane,
  size: sheetSizePane,
  mantra: sheetMantraPane,
  glossary: sheetGlossaryPane,
}

const renderSheet = (paneId, query, onSelectPane, onQuery) => {
  el.sheetTabs.innerHTML = ''
  for (const pane of SHEET_PANES) {
    const button = document.createElement('button')
    button.className = `step-btn${pane.id === paneId ? ' active' : ''}`
    button.textContent = pane.label
    button.addEventListener('click', () => onSelectPane(pane.id))
    el.sheetTabs.appendChild(button)
  }

  el.sheetBody.innerHTML = ''
  SHEET_BUILDERS[paneId](el.sheetBody, query, onQuery)
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
const renderRefAnswer = (drill, hand, isEasy) => {
  if (!hand) {
    el.refAnswer.hidden = true
    el.refPrompt.hidden = false
    return
  }

  const action = drill.answerFor(hand)
  const advice = coachFor(drill, hand, isEasy)

  el.refPrompt.hidden = true
  el.refAnswer.hidden = false
  el.refAnswer.className = `ref-answer ${ACTION_COLORS[action]}-tint`

  el.refAnswerHead.textContent = `${drill.label} で ${hand} は ${ACTION_LABELS[action]}`
  el.refAnswerWhy.textContent = advice.why
  el.refAnswerTip.textContent = advice.tip
}

const renderReference = (selectedKey, pickedHand, isEasy, onSelect, onPick) => {
  const drill = DRILL_BY_KEY[selectedKey]

  renderRefButtons(el.refRfi, RFI_DRILLS, selectedKey, onSelect, (d) => d.hero)
  renderRefButtons(el.refVs, VS_RFI_DRILLS, selectedKey, onSelect, (d) => d.label)

  el.refTitle.textContent = drill.title
  el.refNote.textContent = drill.note
  el.refStats.textContent = refStatsText(drill)

  renderGridInto(el.refGrid, drill, pickedHand, onPick)
  renderLegendInto(el.refLegend, drill)
  renderRefAnswer(drill, pickedHand, isEasy)
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
  renderEasy(state)
  renderStreak(state)
}
