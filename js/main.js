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

// ---- 成績の引っ越し (別 URL / 端末へ持ち越す) ----
//
// 開いているパネルの状態は一時的なので保存しない。
// 読み込みは「押した瞬間に上書き」ではなく、検算 → 確認 → 上書きの 3 段階。

let transfer = null

const showTransfer = (view) => {
  transfer = view
  renderTransfer(transfer)
}

// クリップボードは iOS Safari や iframe の中で使えないことがある。
// 失敗しても書き出した JSON はテキスト欄に残るので、手で選んでコピーできる。
const copyToClipboard = (text, done) => {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard || !navigator.clipboard.writeText) {
      done(false)
      return
    }
    navigator.clipboard.writeText(text).then(() => done(true), () => done(false))
  } catch {
    done(false)
  }
}

el.exportBtn.addEventListener('click', () => {
  const text = exportStateText(state)
  el.transferText.value = text
  showTransfer({ mode: 'export', message: `書き出した (${totalAsked(state)} 問ぶんの記録)` })
  copyToClipboard(text, (copied) => {
    showTransfer({
      mode: 'export',
      message: copied
        ? `コピーした (${totalAsked(state)} 問ぶんの記録) — 移動先の「成績を読み込む」に貼り付ける。`
        : `コピーできなかった — 下の枠の中身を全部選んでコピーする (${totalAsked(state)} 問ぶんの記録)。`,
    })
  })
})

el.importBtn.addEventListener('click', () => {
  el.transferText.value = ''
  showTransfer({ mode: 'import', message: '書き出した JSON を貼り付けて「読み込む」。' })
})

// 中身が書き換わったら確認をやり直す (確認済みの状態で別の JSON を通さない)
el.transferText.addEventListener('input', () => {
  if (transfer && transfer.confirming) {
    showTransfer({ mode: 'import', message: '書き出した JSON を貼り付けて「読み込む」。' })
  }
})

el.transferRun.addEventListener('click', () => {
  const result = importStateText(el.transferText.value || '')

  if (result.error) {
    showTransfer({ mode: 'import', message: `読み込めない: ${result.error}`, isError: true })
    return
  }

  if (!transfer || !transfer.confirming) {
    showTransfer({
      mode: 'import',
      confirming: true,
      message: `本当に上書きする？ 今の記録 (${totalAsked(state)} 問) は消えます。`,
    })
    return
  }

  commit(result.state)
  showTransfer({ mode: 'import', message: `読み込んだ (${totalAsked(state)} 問ぶんの記録)` })
  renderModes(state, selectMode)
  renderDashboard(state, selectFocus)
  renderDaily(state, startDailyTask)
  advance()
})

el.transferClose.addEventListener('click', () => showTransfer(null))

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

  // 試験中はホットキーを試験に回す。ここで分けないと、試験を見ながら押した f が
  // 裏で待っている練習問題の答えとして記録される (検索欄のガードと同じ事故)。
  const examQuestion = examCurrent(exam)
  if (examQuestion) {
    const examDrill = DRILL_BY_KEY[examQuestion.drillKey]
    const examAction = examDrill.actions.find((a) => a.hotkey === key)
    if (examAction) {
      event.preventDefault()
      answerExam(examAction.id)
    }
    return
  }

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

// ---- どれがブラフか (4択) ----
// 役割クイズと同じ形。セッション内のスコアだけ持つ一時状態。

let bluffPick = null

const drawBluffPick = () => renderBluffPick(state, bluffPick, { onAnswer: answerBluffPick })

function nextBluffPick() {
  const score = bluffPick ? bluffPick.score : { asked: 0, correct: 0 }
  bluffPick = { ...randomBluffPick(), score }
  drawBluffPick()
}

function answerBluffPick(hand) {
  if (!bluffPick || bluffPick.chosen !== null) return
  bluffPick = {
    ...bluffPick,
    chosen: hand,
    score: {
      asked: bluffPick.score.asked + 1,
      correct: bluffPick.score.correct + (hand === bluffPick.hand ? 1 : 0),
    },
  }
  drawBluffPick()
}

el.bluffPickNext.addEventListener('click', nextBluffPick)

// ---- 試験モード ----
//
// 20 問走り切るまで正誤を出さず、成績に書くのも最後の 1 回だけ (中断したぶんは記録しない)。
// 時計は 1 問ごとに EXAM_TICK_MS 刻みで進める setTimeout の連鎖で、
// 答えた瞬間と中止した瞬間に必ず止める (止め忘れると裏で次の問題が時間切れになる)。

let exam = null
let examTimer = null

const drawExam = () => renderExam(exam, { onAnswer: answerExam })

const stopExamClock = () => {
  if (examTimer === null) return
  clearTimeout(examTimer)
  examTimer = null
}

const startExamClock = () => {
  stopExamClock()
  if (!examCurrent(exam)) return
  examTimer = setTimeout(tickExam, EXAM_TICK_MS)
}

// 試験が 1 手進んだあとの共通処理。終わっていれば採点して成績へ、続くなら時計を回し直す。
const afterExamStep = () => {
  if (exam.result) {
    stopExamClock()
    // 20 問ぶんをまとめて 1 回で保存する (問題ごとに書くと中断が半端に残る)
    commit(bumpDailyStreak(recordExam(state, exam)))
    drawExam()
    renderStreak(state)
    renderDashboard(state, selectFocus)
    renderDaily(state, startDailyTask)
    return
  }
  drawExam()
  startExamClock()
}

function tickExam() {
  examTimer = null
  if (!examCurrent(exam)) return

  const index = exam.index
  exam = examTick(exam)

  // まだ同じ問題なら時計だけ描き直す (毎回全部描くとカードとボタンが作り直される)
  if (!exam.result && exam.index === index) {
    renderExamClock(exam)
    startExamClock()
    return
  }
  afterExamStep()
}

function answerExam(actionId) {
  if (!examCurrent(exam)) return
  exam = examRecord(exam, actionId)
  afterExamStep()
}

function startExam() {
  exam = freshExam()
  drawExam()
  startExamClock()
}

// 中止したぶんは成績に入れない (途中まで走った試験を半端に記録しない)
function abortExam() {
  stopExamClock()
  exam = null
  drawExam()
}

// カードを閉じたら中止する。見えないところで時計が回り続けると、
// 残り全部が時間切れになって復習キューに積まれる。
el.exam.addEventListener('toggle', () => {
  if (!el.exam.open && exam) abortExam()
})

el.examBegin.addEventListener('click', startExam)
el.examAgain.addEventListener('click', startExam)
el.examAbort.addEventListener('click', abortExam)

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

// ---- 上部のジャンプバー ----
//
// 飛び先が畳んだ <details> なら先に開ける。開けずに飛ぶと renderWhenOpened が走らず、
// 中身が空のまま見出しだけに着地する。
// 見出しが固定バーに隠れないぶんの余白は style.css の scroll-margin-top が持つ。

const jumpTo = (sectionId) => {
  const target = document.getElementById(sectionId)
  if (!target) return
  if (target.tagName === 'DETAILS' && !target.open) target.open = true
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// リンク1つずつではなくバーに1つ付ける (項目を足しても配線を触らなくていい)
el.jump.addEventListener('click', (event) => {
  const href = event.target && event.target.getAttribute ? event.target.getAttribute('href') : null
  if (!href || href[0] !== '#') return
  event.preventDefault()
  jumpTo(href.slice(1))
})

// ---- 起動時の描画 ----
//
// 畳んである <details> の中身は、開かれるまで描かない。全部描くと 169 マスのグリッドを
// 何枚も作り、ソルバーまで回すので、練習を始めるまでの待ち時間がそのぶん伸びる。
// 開いた状態で始まるセクション (growth など) は if 分岐で即描画される。
//
// toggle は開閉どちらでも飛ぶが、閉→開の1回目しか使わないので once で十分。
// 「開いた状態で始まる」ケースだけ1回目が閉じるイベントになるが、それは上の分岐が先に拾う。
const renderWhenOpened = (detailsEl, render) => {
  if (detailsEl.open) {
    render()
    return
  }
  detailsEl.addEventListener('toggle', () => detailsEl.open && render(), { once: true })
}

renderWhenOpened(el.help, renderHelp)
renderWhenOpened(el.glossary, () => renderGlossary())
renderWhenOpened(el.faq, () => renderFaq())
renderWhenOpened(el.mistakes, renderMistakes)
renderWhenOpened(el.equity, () => renderEquity(equityHand, pickEquityHand))
renderWhenOpened(el.fill, () => startFill(DRILLS[0].key))
renderWhenOpened(el.bluffq, nextBluff)
renderWhenOpened(el.bluffPick, nextBluffPick)
renderWhenOpened(el.exam, drawExam)
renderWhenOpened(el.calc, drawCalc)
renderWhenOpened(el.nash, drawNash)
renderWhenOpened(el.growth, () => renderGrowth(growthStep, selectGrowthStep))
renderWhenOpened(el.reference, drawReference)

// ここから下は畳めない (常に見えている) ので必ず描く
closeSheet()
showTransfer(null)
renderModes(state, selectMode)
renderDashboard(state, selectFocus)
renderDaily(state, startDailyTask)
advance()
