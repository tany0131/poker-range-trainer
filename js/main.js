// アプリの配線。state は常に作り直して差し替える (破壊的更新をしない)。

const STREAK_SOUND_AT = 5

let state = loadState()
let current = null
let answered = false

const commit = (next) => {
  state = next
  saveState(state)
}

const advance = () => {
  const { question, reviewQueue } = takeQuestion(state)
  commit({ ...state, reviewQueue })
  current = question
  answered = false
  renderQuestion(state, current, answer)
}

function answer(chosenAction) {
  if (answered || !current) return
  answered = true

  const grade = gradeAnswer(current, chosenAction)

  commit(
    recordAnswer(state, {
      drillKey: current.drillKey,
      hand: current.hand,
      chosenAction,
      correctAction: grade.correctAction,
      isCorrect: grade.isCorrect,
    }),
  )

  if (state.soundOn) {
    const hitStreak =
      grade.isCorrect && state.streak.current > 0 && state.streak.current % STREAK_SOUND_AT === 0
    playTone(grade.isCorrect ? (hitStreak ? 'streak' : 'correct') : 'wrong')
  }

  renderVerdict(current, grade, chosenAction)
  renderDashboard(state, selectFocus)
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
  const mode = next && !modeFits ? (drill.type === 'rfi' ? 'rfi' : 'vsrfi') : state.mode

  commit({ ...state, focus: next, mode })
  renderModes(state, selectMode)
  renderDashboard(state, selectFocus)
  advance()
}

el.next.addEventListener('click', advance)

el.focusClear.addEventListener('click', () => {
  commit({ ...state, focus: null })
  renderDashboard(state, selectFocus)
  advance()
})

el.reset.addEventListener('click', () => {
  commit({ ...freshState(), mode: state.mode, soundOn: state.soundOn })
  renderDashboard(state, selectFocus)
  advance()
})

el.sound.addEventListener('click', () => {
  commit({ ...state, soundOn: !state.soundOn })
  renderSound(state)
  if (state.soundOn) playTone('correct')
})

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return
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

  if (answered && (key === ' ' || key === 'enter')) {
    event.preventDefault()
    advance()
  }
})

// 「レンジの育ち方」の表示位置。学習中の一時的な状態なので保存しない。
let growthStep = 0
const selectGrowthStep = (index) => {
  growthStep = index
  renderGrowth(growthStep, selectGrowthStep)
}

renderHelp()
renderGrowth(growthStep, selectGrowthStep)
renderModes(state, selectMode)
renderDashboard(state)
advance()
