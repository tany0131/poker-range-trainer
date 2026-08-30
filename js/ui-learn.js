// 読んで覚えるカードの描画。レンジの育ち方・今日の特訓・用語解説・
// よくあるミス・勝率表・よくある質問・解説。

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
  renderTermText(el.equityAnswer, pickedHand ? equityAnswerText(pickedHand) : '')
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

// ---- 解説 (ポジションと 3ベット) ----

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
