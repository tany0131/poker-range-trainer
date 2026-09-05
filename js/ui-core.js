// 描画の共通部品。要素の参照 (el)、アクションの色とラベル、SVG と本文中の用語リンク、
// そして複数のカードが共有する 13x13 グリッドの描画をここに置く。
// ui-*.js はどれもこのファイルに依存するので、読み込み順では必ず先頭に来る。
// 状態は受け取って描くだけで、書き換えない。

const ACTION_COLORS = {
  raise: 'act-raise',
  jam: 'act-raise', // オールインはレイズと同じ「攻める」色でよい (同じ画面に並ばない)
  threebet: 'act-threebet',
  call: 'act-call',
  fold: 'act-fold',
}

const ACTION_LABELS = {
  raise: 'レイズ',
  jam: 'オールイン',
  threebet: '3ベット',
  call: 'コール',
  fold: 'フォールド',
  // 試験モードで制限時間が切れたぶん。人が選んだ答えではないので言い方を分ける。
  [TIMEOUT_ACTION]: '時間切れ',
}

// サイズのドリルは action の id がそのまま額 ('7.5bb') なので、固定表からは引けない。
// ドリル自身が持つ action の label を先に見る。
const actionLabelOf = (drill, actionId) => {
  const action = drill.actions.find((a) => a.id === actionId)
  return action ? action.label : ACTION_LABELS[actionId]
}

// ミス 1 件の言い方。ミス履歴と試験の結果が同じ文面を使う。
// 時間切れは「答えた」ではないので、そこだけ言い換える。
const missAnswerText = (drill, chosenAction, correctAction) =>
  chosenAction === TIMEOUT_ACTION
    ? `時間切れ (正解 ${actionLabelOf(drill, correctAction)})`
    : `${actionLabelOf(drill, chosenAction)} と答えた (正解 ${actionLabelOf(drill, correctAction)})`

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
  exportBtn: document.getElementById('btn-export'),
  importBtn: document.getElementById('btn-import'),
  transfer: document.getElementById('transfer'),
  transferMsg: document.getElementById('transfer-msg'),
  transferText: document.getElementById('transfer-text'),
  transferRun: document.getElementById('btn-transfer-run'),
  transferClose: document.getElementById('btn-transfer-close'),
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
  statsHu: document.getElementById('stats-hu'),
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
  bluffPick: document.getElementById('bluffpick'),
  bluffPickSpot: document.getElementById('bluffpick-spot'),
  bluffPickChoices: document.getElementById('bluffpick-choices'),
  bluffPickResult: document.getElementById('bluffpick-result'),
  bluffPickScore: document.getElementById('bluffpick-score'),
  bluffPickNext: document.getElementById('bluffpick-next'),
  exam: document.getElementById('exam'),
  examLead: document.getElementById('exam-lead'),
  examStart: document.getElementById('exam-start'),
  examBegin: document.getElementById('exam-begin'),
  examRun: document.getElementById('exam-run'),
  examBar: document.getElementById('exam-bar'),
  examClock: document.getElementById('exam-clock'),
  examProgress: document.getElementById('exam-progress'),
  examSpot: document.getElementById('exam-spot'),
  examCards: document.getElementById('exam-cards'),
  examHand: document.getElementById('exam-hand'),
  examActions: document.getElementById('exam-actions'),
  examAbort: document.getElementById('exam-abort'),
  examResult: document.getElementById('exam-result'),
  examScore: document.getElementById('exam-score'),
  examMisses: document.getElementById('exam-misses'),
  examAgain: document.getElementById('exam-again'),
}

const NS = 'http://www.w3.org/2000/svg'

// ---- 手札とアクションのボタン ----
//
// 出題カードと試験モードが同じ見た目を使う (別々に書くと、片方だけ直したときに食い違う)。

const renderCardsInto = (target, hand) => {
  target.innerHTML = ''
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
    target.appendChild(node)
  }
}

// 手札の文字表記 ('AKs' → AK + 小さい s)。カードの絵と同じ場所で使う。
const renderHandTextInto = (target, hand) => {
  target.innerHTML = ''
  const base = document.createElement('span')
  base.textContent = isPair(hand) ? hand : hand.slice(0, 2)
  target.appendChild(base)
  if (!isPair(hand)) {
    const suffix = document.createElement('span')
    suffix.className = 'suffix'
    suffix.textContent = hand[2]
    target.appendChild(suffix)
  }
}

const renderActionsInto = (target, drill, onAnswer) => {
  target.innerHTML = ''
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
    target.appendChild(button)
  }
}

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
