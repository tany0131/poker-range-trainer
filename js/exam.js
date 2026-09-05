// 試験モード — 19 スポットの境界線上の手だけを 20 問、1 問 5 秒、判定は最後にまとめて。
//
// 練習と何が違うのか (どれも「実戦の厳しさ」を作るためにある):
//  - 出題プールが境界線上の手だけ (quiz.js の edgeHandsOf)。一様に配ると AA と 72o が大半になり、
//    覚えていなくても取れてしまう。19 スポットを必ず 1 問ずつ通すので、得意な席だけで逃げられない。
//  - 1 問 5 秒。覚えていれば余る長さで、思い出そうとすると落ちる。時間切れは不正解。
//  - 途中で正誤を見せない。境界線上の手は隣のスポットと連動しているので、
//    1 問目の答えを見せた時点で残りのヒントになる。ノーヒントで 20 問走り切ってから採点する。
//
// 結果は普通の練習と同じ経路で成績に入る (recordAnswer) — 復習キュー・ミス履歴・ハンド別成績まで
// 同じ扱い。試験のミスだけ別勘定にすると、苦手モードに出てこない「見えないミス」ができる。

const EXAM_QUESTION_COUNT = 20
const EXAM_LIMIT_MS = 5000

// 残り時間の刻み。実時間ではなくこの刻みを積んで数える (タブが眠っている間は止まる)。
// 「画面を見ていない間に時間切れになっていた」を作らないための選択。
const EXAM_TICK_MS = 100

// 試験の解答は日替わりメニューの進捗にも入る。練習中のモード名を書くと、
// やっていない課題 (境界特訓など) が勝手に進むので、自分のモード名を渡す。
const EXAM_MODE = 'exam'

// 20 問 = 19 スポット 1 問ずつ + 余りをランダムなスポットから。
// 同じ (スポット, ハンド) は 2 回出さない。
const buildExamQuestions = () => {
  const used = new Set()

  const pick = (drill) => {
    const pool = edgeHandsOf(drill).filter((hand) => !used.has(`${drill.key}|${hand}`))
    if (pool.length === 0) return null
    const hand = pool[Math.floor(Math.random() * pool.length)]
    used.add(`${drill.key}|${hand}`)
    return { drillKey: drill.key, hand }
  }

  const everySpot = shuffled(DRILLS).map(pick)
  const extras = shuffled(DRILLS)
    .slice(0, Math.max(0, EXAM_QUESTION_COUNT - DRILLS.length))
    .map(pick)

  return shuffled([...everySpot, ...extras].filter(Boolean))
}

const freshExam = () => ({
  questions: buildExamQuestions(),
  index: 0,
  answers: [],
  remainingMs: EXAM_LIMIT_MS,
  result: null, // 走っている間は null。20 問終わった時点でここに採点結果が入る
})

const examCurrent = (exam) => (exam && !exam.result ? exam.questions[exam.index] || null : null)

const examResultOf = (answers) => ({
  total: answers.length,
  correct: answers.filter((answer) => answer.isCorrect).length,
  timedOut: answers.filter((answer) => answer.chosen === TIMEOUT_ACTION).length,
  misses: answers.filter((answer) => !answer.isCorrect),
})

// 1 問ぶん進める。chosen は選んだ action か TIMEOUT_ACTION。
// 正誤はここで確定させるが、見せるのは最後 (renderExam が result を見て出す)。
const examRecord = (exam, chosen) => {
  const question = examCurrent(exam)
  if (!question) return exam

  const correctAction = DRILL_BY_KEY[question.drillKey].answerFor(question.hand)
  const answers = [
    ...exam.answers,
    { ...question, chosen, correctAction, isCorrect: chosen === correctAction },
  ]
  const index = exam.index + 1
  const isDone = index >= exam.questions.length

  return {
    ...exam,
    answers,
    index,
    remainingMs: EXAM_LIMIT_MS,
    result: isDone ? examResultOf(answers) : null,
  }
}

// 時計を 1 刻みだけ進める。0 になったら時間切れ = 不正解として次の問題へ。
const examTick = (exam) => {
  if (!examCurrent(exam)) return exam

  const remainingMs = exam.remainingMs - EXAM_TICK_MS
  if (remainingMs > 0) return { ...exam, remainingMs }

  return examRecord(exam, TIMEOUT_ACTION)
}

// 20 問ぶんを成績へ畳み込む。走っている途中では呼ばない (中断したぶんは記録しない)。
const recordExam = (state, exam) =>
  exam.answers.reduce(
    (acc, answer) =>
      recordAnswer(acc, {
        drillKey: answer.drillKey,
        hand: answer.hand,
        chosenAction: answer.chosen,
        correctAction: answer.correctAction,
        isCorrect: answer.isCorrect,
        mode: EXAM_MODE,
      }),
    state,
  )
