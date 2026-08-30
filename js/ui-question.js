// 出題まわりの描画。モード選択・テーブル図・カード・アクションボタンと、答え合わせの判定。

const STREAK_HOT = 5

// 座席の描画位置 (プリフロップの行動順に時計回り)
const SEAT_XY = {
  UTG: [66, 71],
  HJ: [170, 37],
  CO: [274, 71],
  BTN: [274, 139],
  SB: [170, 173],
  BB: [66, 139],
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

// ---- テーブル (ヘッズアップ = 残り2人) ----
//
// 6-max の図は席が6つある前提なので、残り2人はこちらで描く。上が相手・下が自分。
// 受ける側 (BB) の出題では、相手のオールインをチップと ALL-IN の札で見せる —
// 「いくら飛んできたのか」が見えないと、必要勝率の話が数字遊びになる。
const HU_SEAT_XY = { villain: [170, 45], hero: [170, 165] }

const huSeatsOf = (drill) =>
  drill.seat === 'sb'
    ? [
        { role: 'villain', label: 'BB', state: 'waiting', tag: '' },
        { role: 'hero', label: 'BTN', state: 'hero', tag: 'YOU' },
      ]
    : [
        { role: 'villain', label: 'BTN', state: 'raiser', tag: 'ALL-IN' },
        { role: 'hero', label: 'BB', state: 'hero', tag: 'YOU' },
      ]

const renderHuTable = (drill) => {
  el.table.innerHTML = ''
  el.table.appendChild(svg('ellipse', { class: 'felt-bg', cx: 170, cy: 105, rx: 120, ry: 68 }))

  const isFacingJam = drill.seat === 'bb'

  // 相手のオールインぶんのチップ。飛んできた額が見えるようにする。
  if (isFacingJam) {
    for (const x of [152, 170, 188]) {
      el.table.appendChild(svg('circle', { class: 'hu-chip', cx: x, cy: 74, r: 4 }))
    }
  }

  const lead = isFacingJam ? `ボタンが ${drill.stackBb}bb オールイン` : '残り2人 (ヘッズアップ)'
  el.table.appendChild(svg('text', { class: 'felt-text', x: 170, y: 92 }, lead))
  el.table.appendChild(svg('text', { class: 'felt-pot', x: 170, y: 106 }, `ポット ${fmtBb(huPot(drill))}`))
  el.table.appendChild(svg('text', { class: 'felt-stack', x: 170, y: 119 }, `残り ${drill.stackBb}bb`))
  el.table.appendChild(svg('text', { class: 'felt-text', x: 170, y: 132 }, 'あなたの番'))

  for (const seat of huSeatsOf(drill)) {
    const [x, y] = HU_SEAT_XY[seat.role]
    const group = svg('g', { class: `seat seat-${seat.state}` })
    group.appendChild(svg('circle', { class: 'seat-ring', cx: x, cy: y, r: 22 }))
    group.appendChild(svg('text', { class: 'seat-label', x, y: y + 1 }, seat.label))
    if (seat.tag) group.appendChild(svg('text', { class: 'seat-tag', x, y: y + 12 }, seat.tag))
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

  // ヘッズアップは席が2つしかないので専用の図を描く (6-max の図は6席前提)
  if (drill.type === 'hu') renderHuTable(drill)
  else renderTable(drill, onSeatTap)

  el.spotTitle.textContent = drill.title
  // 復習は「2回連続正解」で卒業する。あと何回で抜けるかを出さないと、
  // 同じ手が返ってくる理由が分からず徒労に見える。
  const remaining = REVIEW_GRADUATE_AT - (question.streak || 0)
  el.spotNote.textContent = question.isReview
    ? `${drill.note} — 復習 (あと ${remaining} 回連続正解で卒業)`
    : drill.note

  renderHandArea(drill, question.hand)

  renderActions(drill, onAnswer)
  clearActionMarks()
  renderStreak(state)
  el.verdict.hidden = true
}

// ---- 判定 ----

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

  // ヘッズアップは丸める前のソルバーの頻度まで見せる。
  // 「1ハンド1答」に丸めているのはこちらの都合なので、元の数字を隠さない。
  if (drill.type === 'hu') {
    const freq = (drill.freqOf(question.hand) * 100).toFixed(0)
    const solverAction = drill.seat === 'sb' ? 'オールイン' : 'コール'
    const solverLine = `ソルバーはこの手を ${freq}% で${solverAction}する。`
    const shareText =
      grade.correctAction === 'fold'
        ? `${drill.stackBb}bb で降りる手は全体の ${drill.foldBaseline.toFixed(0)}%。`
        : `${drill.stackBb}bb で ${correctLabel} する手は全体の ${pctOf(drill.sets[grade.correctAction]).toFixed(0)}%。`
    return `${drill.label} で ${question.hand} は ${correctLabel}。${solverLine}${shareText}`
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
    renderTermText(el.coachWhy, advice.why)
    renderTermText(el.coachTip, advice.tip)
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
