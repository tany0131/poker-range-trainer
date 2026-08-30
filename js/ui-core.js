// 描画の共通部品。要素の参照 (el)、アクションの色とラベル、SVG と本文中の用語リンク、
// そして複数のカードが共有する 13x13 グリッドの描画をここに置く。
// ui-*.js はどれもこのファイルに依存するので、読み込み順では必ず先頭に来る。
// 状態は受け取って描くだけで、書き換えない。

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
  jump: document.getElementById('jump'),
  // 畳んだセクションの <details> 本体。main.js が「開いたら描く」の配線に使う。
  growth: document.getElementById('growth'),
  reference: document.getElementById('reference'),
  fill: document.getElementById('fill'),
  bluffq: document.getElementById('bluffq'),
  equity: document.getElementById('equity'),
  calc: document.getElementById('calc'),
  nash: document.getElementById('nash'),
  faq: document.getElementById('faq'),
  mistakes: document.getElementById('mistakes'),
  help: document.getElementById('help'),
  glossary: document.getElementById('glossary'),
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
  weakHandsBox: document.getElementById('weak-hands'),
  weakHandList: document.getElementById('weak-hand-list'),
  refMissToggle: document.getElementById('ref-miss-toggle'),
  fillRfi: document.getElementById('fill-rfi'),
  fillVs: document.getElementById('fill-vs'),
  fillNote: document.getElementById('fill-note'),
  fillGrid: document.getElementById('fill-grid'),
  fillLegend: document.getElementById('fill-legend'),
  fillGrade: document.getElementById('fill-grade'),
  fillRetry: document.getElementById('fill-retry'),
  fillResult: document.getElementById('fill-result'),
  calcRanges: document.getElementById('calc-ranges'),
  calcNote: document.getElementById('calc-note'),
  calcGrid: document.getElementById('calc-grid'),
  calcPrompt: document.getElementById('calc-prompt'),
  calcAnswer: document.getElementById('calc-answer'),
  nashStacks: document.getElementById('nash-stacks'),
  nashStats: document.getElementById('nash-stats'),
  nashSbGrid: document.getElementById('nash-sb-grid'),
  nashBbGrid: document.getElementById('nash-bb-grid'),
  missLogBody: document.getElementById('misslog-body'),
  missLogCount: document.getElementById('misslog-count'),
  missLogNote: document.getElementById('misslog-note'),
  bluffSpot: document.getElementById('bluff-spot'),
  bluffButtons: document.getElementById('bluff-buttons'),
  bluffResult: document.getElementById('bluff-result'),
  bluffScore: document.getElementById('bluff-score'),
  bluffNext: document.getElementById('bluff-next'),
}

const NS = 'http://www.w3.org/2000/svg'

// ---- 本文の用語リンク (ウィキ風) ----
// 説明文の中の専門用語をタップできるようにする。タップの先 (早見表の用語タブを開く) は
// main.js が setTermTapHandler で配線する。

let termTapHandler = null
const setTermTapHandler = (handler) => {
  termTapHandler = handler
}

const renderTermText = (container, text) => {
  container.textContent = ''
  let cursor = 0

  for (const span of findTermSpans(text)) {
    if (span.start > cursor) {
      container.appendChild(document.createTextNode(text.slice(cursor, span.start)))
    }
    const link = document.createElement('button')
    link.className = 'term-link'
    link.textContent = span.alias
    link.addEventListener('click', () => termTapHandler && termTapHandler(span.alias))
    container.appendChild(link)
    cursor = span.end
  }

  if (cursor < text.length) container.appendChild(document.createTextNode(text.slice(cursor)))
}

const svg = (tag, attrs, text) => {
  const node = document.createElementNS(NS, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  if (text !== undefined) node.textContent = text
  return node
}

// ---- ハンドの説明 ----

const describeHand = (hand) => {
  if (isPair(hand)) return 'ポケットペア / 6 combos'
  return isSuited(hand) ? 'スーテッド / 4 combos' : 'オフスーツ / 12 combos'
}

// ---- 13x13 グリッド ----
//
// 出題の全体レンジ・定石ビューア・穴埋めテストが同じ描画を使う。

// onPick を渡すとマスがタップできるようになる (定石ビューアの「この手なんで？」)。
// missSet を渡すと、そのハンドに赤枠を付ける (自分のミスの重ね書き)。
const renderGridInto = (target, drill, currentHand = null, onPick = null, missSet = null) => {
  target.innerHTML = ''
  for (const hand of ALL_HANDS) {
    const action = drill.answerFor(hand)
    const cell = document.createElement('div')
    cell.className = `cell ${ACTION_COLORS[action]}`
    if (currentHand !== null && hand === currentHand) cell.classList.add('current')
    if (missSet && missSet.has(hand)) cell.classList.add('cell-missed')
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
