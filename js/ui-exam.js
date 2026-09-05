// 試験モードの描画。3 つの画面 (開始前 / 走行中 / 結果) を出し分けるだけで、
// 出題と採点は js/exam.js が持つ (ここは state を書き換えない)。
//
// 走行中は正誤を一切出さない。ボタンに色も付けない — 押した瞬間に答えが分かると、
// 20 問ノーヒントで走り切る試験にならない。

// 残り時間が少ないと分かる線。ここを割ったらバーが赤くなる。
const EXAM_HURRY_MS = 2000

const examScoreText = (result) => {
  const pct = Math.round((result.correct / result.total) * 100)
  const timedOut =
    result.timedOut > 0 ? ` うち時間切れ ${result.timedOut} 問。` : ' 時間切れなし。'
  return `${result.total} 問中 ${result.correct} 問正解 (${pct}%)。${timedOut}`
}

const renderExamMisses = (result) => {
  el.examMisses.innerHTML = ''

  if (result.misses.length === 0) {
    const line = document.createElement('p')
    line.className = 'exam-miss'
    line.textContent = '全問正解。境界線上の手を 5 秒で捌けている。'
    el.examMisses.appendChild(line)
    return
  }

  for (const miss of result.misses) {
    const drill = DRILL_BY_KEY[miss.drillKey]
    const line = document.createElement('p')
    line.className = 'exam-miss'
    line.textContent = `${drill.label} · ${miss.hand} — ${missAnswerText(drill, miss.chosen, miss.correctAction)}`
    el.examMisses.appendChild(line)
  }
}

// 残り時間だけの描き直し。100ms ごとにカードとボタンまで作り直すと、
// 押している最中のボタンが差し替わる (取りこぼしと点滅の原因)。
const renderExamClock = (exam) => {
  const remaining = Math.max(0, exam.remainingMs)
  el.examClock.textContent = `残り ${(remaining / 1000).toFixed(1)} 秒`
  el.examBar.style.width = `${(remaining / EXAM_LIMIT_MS) * 100}%`
  el.examBar.classList.toggle('hurry', exam.remainingMs <= EXAM_HURRY_MS)
}

const renderExamRun = (exam, onAnswer) => {
  const question = examCurrent(exam)
  const drill = DRILL_BY_KEY[question.drillKey]

  el.examProgress.textContent = `${exam.index + 1} / ${exam.questions.length} 問目`
  renderExamClock(exam)

  el.examSpot.textContent = drill.title
  renderCardsInto(el.examCards, question.hand)
  renderHandTextInto(el.examHand, question.hand)
  renderActionsInto(el.examActions, drill, onAnswer)
}

// view = exam (null = まだ始めていない)
const renderExam = (exam, handlers) => {
  const isRunning = Boolean(examCurrent(exam))
  const isDone = Boolean(exam && exam.result)

  el.examStart.hidden = isRunning || isDone
  el.examRun.hidden = !isRunning
  el.examResult.hidden = !isDone

  if (isRunning) {
    renderExamRun(exam, handlers.onAnswer)
    return
  }

  if (isDone) {
    el.examScore.textContent = examScoreText(exam.result)
    renderExamMisses(exam.result)
  }
}
