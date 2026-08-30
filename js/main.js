// アプリの配線。state は常に作り直して差し替える (破壊的更新をしない)。

const STREAK_SOUND_AT = 5

let state = loadState()
let current = null
let answered = false
let lastChoice = null // 「やさしく」を切り替えたときに、表示中の判定を描き直すため

const commit = (next) => {
  state = next
  saveState(state)
}

const advance = () => {
  const { question, reviewQueue } = takeQuestion(state)
  commit({ ...state, reviewQueue })
  current = question
  answered = false
  lastChoice = null
  renderQuestion(state, current, answer, () => openSheet('positions'))
}

function answer(chosenAction) {
  if (answered || !current) return
  answered = true
  lastChoice = chosenAction

  const grade = gradeAnswer(current, chosenAction)

  const recorded = recordAnswer(state, {
    drillKey: current.drillKey,
    hand: current.hand,
    chosenAction,
    correctAction: grade.correctAction,
    isCorrect: grade.isCorrect,
    // 復習として出した問題かどうかで、キューに戻すか卒業させるかが変わる
    isReview: current.isReview === true,
    reviewStreak: current.streak,
  })

  // 記録と連続日数の更新を 1 回の保存にまとめる (完走判定は記録後の今日のログから作り直す)
  commit(bumpDailyStreak(recorded))

  if (state.soundOn) {
    const hitStreak =
      grade.isCorrect && state.streak.current > 0 && state.streak.current % STREAK_SOUND_AT === 0
    playTone(grade.isCorrect ? (hitStreak ? 'streak' : 'correct') : 'wrong')
  }

  renderVerdict(state, current, grade, chosenAction)
  renderDashboard(state, selectFocus)
  renderDaily(state, startDailyTask)
}

const selectMode = (modeId) => {
  if (modeId === state.mode) return
  // モードを切り替えたら狙い撃ちは解除する (RFI を狙い撃ったまま 3ベットへ行くと出題が空になる)
  commit({ ...state, mode: modeId, focus: null })
  renderModes(state, selectMode)
  renderDashboard(state, selectFocus)
  advance()
}

// 成績表の行をタップ → そのスポットだけを出題。もう一度押すと解除 (トグル)。
function selectFocus(drillKey) {
  const next = state.focus === drillKey ? null : drillKey

  // 狙い撃ち対象が今のモードに含まれていなければ、モードごと合わせる
  const drill = DRILL_BY_KEY[drillKey]
  const modeFits = MODE_BY_ID[state.mode].drills().some((d) => d.key === drillKey)
  const mode = next && !modeFits ? defaultModeFor(drill) : state.mode

  commit({ ...state, focus: next, mode })
  renderModes(state, selectMode)
  renderDashboard(state, selectFocus)
  advance()
}

// 日替わりメニューの行をタップ → そのモード / 狙い撃ちに切り替えて出題を始める。
function startDailyTask(task) {
  commit({ ...state, mode: task.mode, focus: task.focus })
  renderModes(state, selectMode)
  renderDashboard(state, selectFocus)
  renderDaily(state, startDailyTask)
  advance()
}

el.next.addEventListener('click', advance)

el.focusClear.addEventListener('click', () => {
  commit({ ...state, focus: null })
  renderDashboard(state, selectFocus)
  advance()
})

el.reset.addEventListener('click', () => {
  commit({ ...freshState(), mode: state.mode, soundOn: state.soundOn, easyMode: state.easyMode })
  renderDashboard(state, selectFocus)
  renderDaily(state, startDailyTask)
  advance()
})

el.glossarySearch.addEventListener('input', () => renderGlossary(el.glossarySearch.value))
el.faqSearch.addEventListener('input', () => renderFaq(el.faqSearch.value))

el.sound.addEventListener('click', () => {
  commit({ ...state, soundOn: !state.soundOn })
  renderSound(state)
  if (state.soundOn) playTone('correct')
})

// 説明の言葉づかいを切り替える。答えは変わらないので、出題はやり直さない。
// 表示中のコーチ文と定石ビューアの答えはその場で書き換える。
el.easy.addEventListener('click', () => {
  commit({ ...state, easyMode: !state.easyMode })
  renderEasy(state)
  renderModes(state, selectMode)
  drawReference()
  renderMissLog(state)
  if (answered && current && lastChoice) {
    renderVerdict(state, current, gradeAnswer(current, lastChoice), lastChoice)
  }
})

// 文字を打つ場所 (用語検索・FAQ 検索・早見表の検索) にフォーカスがある間はホットキーを拾わない。
// ここを抜くと「fold」と検索しただけで f = フォールドが回答として記録される。
const isTypingTarget = (target) => {
  if (!target || typeof target.tagName !== 'string') return false
  const tag = target.tagName.toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true
}

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  if (isTypingTarget(event.target)) return
  const key = event.key.toLowerCase()

  if (!answered && current) {
    const drill = DRILL_BY_KEY[current.drillKey]
    const action = drill.actions.find((a) => a.hotkey === key)
    if (action) {
      event.preventDefault()
      answer(action.id)
    }
    return
  }

  if (key === 'escape' && !el.sheet.hidden) {
    event.preventDefault()
    closeSheet()
    return
  }

  if (answered && (key === ' ' || key === 'enter')) {
    event.preventDefault()
    advance()
  }
})

// ---- 早見表 (右下のボタン / 席タップから開く) ----
// 開閉・タブ・検索語はすべて一時的な状態なので保存しない。

let sheetPane = 'positions'
let sheetQuery = ''

const drawSheet = () => renderSheet(sheetPane, sheetQuery, selectSheetPane, setSheetQuery)

function openSheet(pane) {
  if (pane) sheetPane = pane
  el.sheet.hidden = false
  drawSheet()
}

function closeSheet() {
  el.sheet.hidden = true
}

function selectSheetPane(paneId) {
  sheetPane = paneId
  drawSheet()
}

function setSheetQuery(query) {
  sheetQuery = query
  drawSheet()
}

// 本文中の用語タップ → 早見表の用語タブをその語で開く (ウィキ風リンクの飛び先)
function openTermInSheet(alias) {
  sheetPane = 'glossary'
  sheetQuery = alias
  el.sheet.hidden = false
  drawSheet()
}
setTermTapHandler(openTermInSheet)

el.sheetFab.addEventListener('click', () => openSheet())
el.sheetClose.addEventListener('click', closeSheet)
// パネルの外 (背景) をタップしても閉じる
el.sheet.addEventListener('click', (event) => {
  if (event.target === el.sheet) closeSheet()
})

// ---- 勝率表 ----

let equityHand = null
function pickEquityHand(hand) {
  equityHand = equityHand === hand ? null : hand
  renderEquity(equityHand, pickEquityHand)
}

// 「レンジの育ち方」の表示位置。学習中の一時的な状態なので保存しない。
let growthStep = 0
const selectGrowthStep = (index) => {
  growthStep = index
  renderGrowth(growthStep, selectGrowthStep)
}

// 定石ビューアの選択スポットと、タップされたマス。一時的な状態なので保存しない。
let referenceKey = DRILLS[0].key
let referenceHand = null
let referenceShowMiss = false

const drawReference = () =>
  renderReference(
    { key: referenceKey, hand: referenceHand, isEasy: state.easyMode, showMisses: referenceShowMiss, state },
    selectReference,
    pickReferenceHand,
  )

el.refMissToggle.addEventListener('click', () => {
  referenceShowMiss = !referenceShowMiss
  drawReference()
})

// スポットを切り替えたらタップは解除する (別スポットの答えが残ると混乱する)
function selectReference(drillKey) {
  referenceKey = drillKey
  referenceHand = null
  drawReference()
}

// 同じマスをもう一度タップすると解除 (トグル)
function pickReferenceHand(hand) {
  referenceHand = referenceHand === hand ? null : hand
  drawReference()
}

// はじめての人向けの導入は、まだ1問も答えていないときだけ開いておく。
// 一度でも練習していれば畳んだ状態で始める (毎回たたむ手間をかけさせない)。
el.intro.open = state.history.length === 0

// ---- レンジ穴埋めテスト ----
// 挑戦中の状態は一時的 (自己ベストだけ state に保存する)。

let fill = null

const drawFill = () =>
  renderFill(state, fill, { onSelect: startFill, onTap: tapFillCell })

function startFill(drillKey) {
  fill = { drillKey, blanks: pickFillBlanks(DRILL_BY_KEY[drillKey]), guesses: {}, result: null }
  drawFill()
}

// タップするたびに、そのドリルで選べるアクションを順に切り替える
function tapFillCell(hand) {
  if (!fill || fill.result) return
  const actions = DRILL_BY_KEY[fill.drillKey].actions.map((a) => a.id)
  const current = fill.guesses[hand]
  const next = actions[(actions.indexOf(current) + 1) % actions.length]
  fill = { ...fill, guesses: { ...fill.guesses, [hand]: next } }
  drawFill()
}

function gradeFill() {
  if (!fill || fill.result) return
  const result = gradeFillGuesses(DRILL_BY_KEY[fill.drillKey], fill.blanks, fill.guesses)
  commit(recordFillResult(state, fill.drillKey, result.pct))
  fill = { ...fill, result }
  drawFill()
}

el.fillGrade.addEventListener('click', gradeFill)
el.fillRetry.addEventListener('click', () => startFill(fill.drillKey))

// ---- バリューかブラフか (役割クイズ) ----
// セッション内のスコアだけ持つ一時状態。3ベットする手の中から一様に引く。

let bluff = null

const drawBluff = () => renderBluff(state, bluff, { onAnswer: answerBluff })

function nextBluff() {
  const drill = VS_RFI_DRILLS[Math.floor(Math.random() * VS_RFI_DRILLS.length)]
  const hands = [...drill.sets.threebet]
  const hand = hands[Math.floor(Math.random() * hands.length)]
  bluff = { drillKey: drill.key, hand, chosen: null, score: bluff ? bluff.score : { asked: 0, correct: 0 } }
  drawBluff()
}

function answerBluff(roleId) {
  if (!bluff || bluff.chosen !== null) return
  const correct = threebetRoleOf(DRILL_BY_KEY[bluff.drillKey], bluff.hand)
  bluff = {
    ...bluff,
    chosen: roleId,
    score: {
      asked: bluff.score.asked + 1,
      correct: bluff.score.correct + (roleId === correct ? 1 : 0),
    },
  }
  drawBluff()
}

el.bluffNext.addEventListener('click', nextBluff)

// ---- エクイティ電卓 ----

let calcRangeId = 'UTG'
let calcHand = null

const drawCalc = () => renderCalc({ rangeId: calcRangeId, hand: calcHand }, selectCalcRange, pickCalcHand)

function selectCalcRange(rangeId) {
  calcRangeId = rangeId
  drawCalc()
}

function pickCalcHand(hand) {
  calcHand = calcHand === hand ? null : hand
  drawCalc()
}

// ---- プッシュ/フォールド ソルバー ----
// 解は stack ごとに1回だけ計算してキャッシュする (端末内で数十 ms)。

const nashCache = {}
let nashStack = 10

const nashSolutionFor = (stackBb) => {
  if (!nashCache[stackBb]) nashCache[stackBb] = solvePushFold(stackBb)
  return nashCache[stackBb]
}

const drawNash = () => renderNash(nashSolutionFor(nashStack), selectNashStack)

function selectNashStack(stackBb) {
  nashStack = stackBb
  drawNash()
}

renderHelp()
renderGlossary()
renderFaq()
renderMistakes()
renderEquity(equityHand, pickEquityHand)
startFill(DRILLS[0].key)
nextBluff()
drawCalc()
drawNash()
closeSheet()
renderGrowth(growthStep, selectGrowthStep)
drawReference()
renderModes(state, selectMode)
renderDashboard(state, selectFocus)
renderDaily(state, startDailyTask)
advance()
