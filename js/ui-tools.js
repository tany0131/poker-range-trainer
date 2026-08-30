// 自分で手を動かす練習ツールの描画。定石ビューア・レンジ穴埋めテスト・
// エクイティ電卓・プッシュ/フォールド ソルバー・役割クイズ。

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
  renderTermText(el.refAnswerWhy, advice.why)
  renderTermText(el.refAnswerTip, advice.tip)
}

// 自分がミスしたことのある手 (このドリル限定)。重ね書き表示用。
const missedHandsOf = (state, drillKey) => {
  const hands = (state.byHand || {})[drillKey] || {}
  return new Set(Object.keys(hands).filter((hand) => hands[hand].w > 0))
}

const renderReference = (view, onSelect, onPick, onToggleMiss) => {
  const drill = DRILL_BY_KEY[view.key]

  renderRefButtons(el.refRfi, RFI_DRILLS, view.key, onSelect, (d) => d.hero)
  renderRefButtons(el.refVs, VS_RFI_DRILLS, view.key, onSelect, (d) => d.label)

  el.refTitle.textContent = drill.title
  el.refNote.textContent = drill.note
  el.refStats.textContent = refStatsText(drill)

  const misses = view.showMisses ? missedHandsOf(view.state, view.key) : null
  el.refMissToggle.textContent = `自分のミスを重ねる: ${view.showMisses ? 'ON' : 'OFF'}`
  el.refMissToggle.classList.toggle('on', view.showMisses)

  renderGridInto(el.refGrid, drill, view.hand, onPick, misses)
  renderLegendInto(el.refLegend, drill)
  renderRefAnswer(drill, view.hand, view.isEasy)
}

// ---- レンジ穴埋めテスト ----
//
// ? のマスをタップしてアクションを選び、採点する。境界線上のマスだけが隠れる。
// view = { drillKey, blanks, guesses, result }

const renderFill = (state, view, handlers) => {
  const drill = DRILL_BY_KEY[view.drillKey]

  renderRefButtons(el.fillRfi, RFI_DRILLS, view.drillKey, handlers.onSelect, (d) => d.hero)
  renderRefButtons(el.fillVs, VS_RFI_DRILLS, view.drillKey, handlers.onSelect, (d) => d.label)

  const filled = view.blanks.filter((hand) => view.guesses[hand]).length
  const best = state.fillBest[view.drillKey]
  el.fillNote.textContent =
    `${drill.title} — ? のマスをタップしてアクションを選ぶ (${filled}/${view.blanks.length})` +
    (best !== undefined ? `。自己ベスト ${best}%` : '')

  const blankSet = new Set(view.blanks)
  el.fillGrid.innerHTML = ''
  for (const hand of ALL_HANDS) {
    const cell = document.createElement('div')

    if (!blankSet.has(hand)) {
      cell.className = `cell ${ACTION_COLORS[drill.answerFor(hand)]} fill-context`
      cell.textContent = hand
    } else {
      const guess = view.guesses[hand]
      cell.className = `cell fill-blank${guess ? ` ${ACTION_COLORS[guess]}` : ''}`
      cell.textContent = guess ? hand : '?'

      if (view.result) {
        const isRight = guess === drill.answerFor(hand)
        cell.classList.add(isRight ? 'fill-right' : 'fill-wrong')
        // 採点後は正解の色で見せる (間違えたマスこそ正しい答えを見て終わる)
        if (!isRight) {
          cell.className = `cell ${ACTION_COLORS[drill.answerFor(hand)]} fill-blank fill-wrong`
          cell.textContent = hand
        }
      } else {
        cell.classList.add('pickable')
        cell.addEventListener('click', () => handlers.onTap(hand))
      }
    }

    el.fillGrid.appendChild(cell)
  }

  renderLegendInto(el.fillLegend, drill)

  el.fillGrade.hidden = Boolean(view.result)
  el.fillRetry.hidden = !view.result

  if (view.result) {
    const { pct, wrong } = view.result
    const wrongText =
      wrong.length === 0
        ? '全問正解。'
        : `間違い: ${wrong.map((w) => `${w.hand} → ${actionLabelOf(drill, w.correct)}`).join(' / ')}`
    el.fillResult.hidden = false
    el.fillResult.textContent = `${view.blanks.length} マス中 ${view.blanks.length - wrong.length} 正解 (${pct}%)。${wrongText}`
  } else {
    el.fillResult.hidden = true
  }
}

// ---- エクイティ電卓 (自分の手 vs 相手のレンジ) ----

const CALC_RANGES = [
  ...RFI_DRILLS.map((drill) => ({
    id: drill.hero,
    label: `${drill.hero} オープン`,
    set: drill.sets.raise,
  })),
  { id: 'random', label: 'ランダム', set: new Set(UNIQUE_HANDS) },
]

const CALC_RANGE_BY_ID = Object.fromEntries(CALC_RANGES.map((r) => [r.id, r]))

const calcHeatClass = (pct) => {
  if (pct >= 60) return 'eq-4'
  if (pct >= 50) return 'eq-3'
  if (pct >= 42) return 'eq-2'
  if (pct >= 34) return 'eq-1'
  return 'eq-0'
}

// BB ディフェンスの損益分岐 (追加 1.5bb で 5.5bb を狙う)
const BB_DEFENSE_NEED = ((bbValue(RAISE_SIZE.DEFAULT) - BLINDS.BB) / (bbValue(RAISE_SIZE.DEFAULT) * 2 + BLINDS.SB)) * 100

const calcAnswerText = (rangeId, hand) => {
  const range = CALC_RANGE_BY_ID[rangeId]
  const equity = equityVsRange(hand, range.set)
  const lines = [`${hand} は ${range.label}レンジに対して勝率 ${equity.toFixed(1)}%。`]

  const defenseDrill = DRILL_BY_KEY[`${rangeId}_BB`]
  if (defenseDrill) {
    const answer = defenseDrill.answerFor(hand)
    const need = BB_DEFENSE_NEED.toFixed(0)
    lines.push(`BB が守る損益分岐はポットオッズで約 ${need}%。チャートの答え (BB) は ${actionLabelOf(defenseDrill, answer)}。`)

    if (equity >= BB_DEFENSE_NEED && answer === 'fold') {
      lines.push('勝率はオッズを超えているのに降り — ドミネートや位置の悪さで、この勝率をそのまま実現できない手。オッズだけでは決められない実例。')
    } else if (equity < BB_DEFENSE_NEED && answer !== 'fold') {
      lines.push('勝率はオッズに足りないのに続行 — 化けやすさや主導権で、勝率の数字以上に取れる手。')
    }
  }

  return lines.join(' ')
}

const renderCalc = (view, onSelectRange, onPick) => {
  el.calcRanges.innerHTML = ''
  for (const range of CALC_RANGES) {
    const button = document.createElement('button')
    button.className = `step-btn${range.id === view.rangeId ? ' active' : ''}`
    button.textContent = range.label
    button.addEventListener('click', () => onSelectRange(range.id))
    el.calcRanges.appendChild(button)
  }

  const range = CALC_RANGE_BY_ID[view.rangeId]
  el.calcNote.textContent =
    view.rangeId === 'random'
      ? '相手 = ランダムな 1 人 (勝率表と同じ前提)。'
      : `相手 = ${range.label}レンジ ${pctOf(range.set).toFixed(0)}% (${range.set.size} ハンド)。全 169 ハンドの勝率をその場で計算している。`

  el.calcGrid.innerHTML = ''
  for (const hand of ALL_HANDS) {
    const equity = equityVsRange(hand, range.set)
    const cell = document.createElement('div')
    cell.className = `cell pickable ${calcHeatClass(equity)}`
    if (view.hand === hand) cell.classList.add('current')
    cell.textContent = hand
    cell.addEventListener('click', () => onPick(hand))
    el.calcGrid.appendChild(cell)
  }

  el.calcPrompt.hidden = view.hand !== null
  el.calcAnswer.hidden = view.hand === null
  renderTermText(el.calcAnswer, view.hand ? calcAnswerText(view.rangeId, view.hand) : '')
}

// ---- プッシュ/フォールド ソルバー ----

const NASH_STACKS = [3, 5, 8, 10, 12, 15, 20]

// 頻度をマスの見た目に変える。ほぼ常に / 混合 / ほぼ無し の3段階。
const nashCellClass = (freq) => (freq >= 0.9 ? 'act-raise' : freq <= 0.1 ? 'act-fold' : 'act-call')

const renderNashGrid = (target, freqs) => {
  target.innerHTML = ''
  for (const hand of ALL_HANDS) {
    const cell = document.createElement('div')
    cell.className = `cell ${nashCellClass(freqs[hand])}`
    cell.textContent = hand
    target.appendChild(cell)
  }
}

const renderNash = (result, onSelectStack) => {
  el.nashStacks.innerHTML = ''
  for (const stack of NASH_STACKS) {
    const button = document.createElement('button')
    button.className = `step-btn${stack === result.stackBb ? ' active' : ''}`
    button.textContent = `${stack}bb`
    button.addEventListener('click', () => onSelectStack(stack))
    el.nashStacks.appendChild(button)
  }

  el.nashStats.textContent =
    `${result.stackBb}bb 持ち: SB は ${result.jamPct.toFixed(1)}% をジャム、BB は ${result.callPct.toFixed(1)}% でコール。` +
    `この解への最大搾取可能性は ${result.exploitability.toFixed(3)}bb — 実質、均衡 (= GTO)。`

  renderNashGrid(el.nashSbGrid, result.jam)
  renderNashGrid(el.nashBbGrid, result.call)
}

// ---- バリューかブラフか (3ベットの役割クイズ) ----
//
// 3ベットする手を見せて、その役割 (バリュー / ブラフ) を当てる。
// 答えは threebetRoleOf (コーチの説明と同じ分岐) から出す。
// view = { drillKey, hand, chosen, score: { asked, correct } }

const BLUFF_ROLES = [
  { id: 'value', label: 'バリュー', tone: 'aggro' },
  { id: 'bluff', label: 'ブラフ', tone: 'passive' },
]

const ROLE_HEADLINES = {
  value: '呼ばれても勝ちにいけるバリュー。ポットを育てたい 3ベット。',
  bluff: '降ろすのが主目的のブラフ枠。呼ばれた時のための保険 (ブロッカー / 化け筋) 付き。',
}

const renderBluff = (state, view, handlers) => {
  const drill = DRILL_BY_KEY[view.drillKey]

  el.bluffSpot.textContent = `${drill.raiser} がレイズ。${drill.hero} のあなたは ${view.hand} で 3ベットする — この 3ベットの役割は？`

  el.bluffButtons.innerHTML = ''
  const correctRole = threebetRoleOf(drill, view.hand)

  for (const role of BLUFF_ROLES) {
    const button = document.createElement('button')
    button.className = `action-btn tone-${role.tone}`
    button.dataset.role = role.id
    button.textContent = role.label
    button.disabled = view.chosen !== null

    if (view.chosen !== null) {
      if (role.id === correctRole) button.classList.add('is-correct')
      else if (role.id === view.chosen) button.classList.add('is-wrong')
      else button.classList.add('is-muted')
    }

    button.addEventListener('click', () => handlers.onAnswer(role.id))
    el.bluffButtons.appendChild(button)
  }

  if (view.chosen !== null) {
    const advice = coachFor(drill, view.hand, state.easyMode)
    el.bluffResult.hidden = false
    renderTermText(el.bluffResult, `${ROLE_HEADLINES[correctRole]} ${advice.why}`)
    el.bluffNext.hidden = false
  } else {
    el.bluffResult.hidden = true
    el.bluffNext.hidden = true
  }

  const { asked, correct } = view.score
  el.bluffScore.textContent = asked > 0 ? `今回のセッション: ${asked} 問中 ${correct} 問正解` : ''
}
