// ブラウザなしでアプリ本体を実行して検証する。
// js/*.js を実際に vm で読み込むので、ReferenceError や配線ミスもここで落ちる。
//   node tools/verify.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let failures = 0
const check = (ok, label, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`)
}

// ---- 最小 DOM スタブ ----

const makeElement = () => ({
  children: [],
  attributes: {},
  style: {},
  dataset: {},
  textContent: '',
  hidden: false,
  disabled: false,
  offsetWidth: 0,
  className: '',
  classList: {
    _set: new Set(),
    add(...names) {
      names.forEach((n) => this._set.add(n))
    },
    remove(...names) {
      names.forEach((n) => this._set.delete(n))
    },
    toggle(name, force) {
      if (force === undefined) this._set.has(name) ? this._set.delete(name) : this._set.add(name)
      else if (force) this._set.add(name)
      else this._set.delete(name)
    },
    contains(name) {
      return this._set.has(name)
    },
  },
  set innerHTML(_) {
    this.children = []
  },
  get innerHTML() {
    return ''
  },
  appendChild(child) {
    this.children.push(child)
    return child
  },
  setAttribute(key, value) {
    this.attributes[key] = value
  },
  addEventListener() {},
  focus() {},
})

const elements = new Map()
const store = new Map()

const context = {
  console,
  Math,
  JSON,
  Object,
  Array,
  Set,
  Map,
  String,
  Number,
  Error,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  },
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement())
      return elements.get(id)
    },
    createElement: makeElement,
    createElementNS: makeElement,
    createTextNode: (t) => ({ text: t }),
    addEventListener() {},
  },
}
context.window = context // AudioContext は未定義 → 音は自動的に no-op

vm.createContext(context)

const SCRIPTS = [
  'js/ranges.js',
  'js/spots.js',
  'js/cards.js',
  'js/stats.js',
  'js/quiz.js',
  'js/audio.js',
  'js/ui.js',
  'js/main.js',
]

try {
  for (const file of SCRIPTS) {
    vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), context, { filename: file })
  }
  check(true, 'js/*.js が全部読み込めて main.js の初期化まで走る')
} catch (error) {
  check(false, 'スクリプト読み込み', `${error.name}: ${error.message}`)
  process.exit(1)
}

const run = (code) => vm.runInContext(code, context)

// ---- RFI レンジ ----

const RFI_TARGETS = { UTG: [15, 17], HJ: [19, 22], CO: [25, 30], BTN: [40, 48], SB: [39, 47] }

for (const [id, [lo, hi]] of Object.entries(RFI_TARGETS)) {
  const pct = run(`100 - DRILL_BY_KEY['RFI_${id}'].foldBaseline`)
  check(pct >= lo && pct <= hi, `RFI ${id} レンジ ${pct.toFixed(1)}%`, `(帯 ${lo}-${hi}%)`)
}

const RFI_ORDER = ['UTG', 'HJ', 'CO', 'BTN']
for (let i = 0; i < RFI_ORDER.length - 1; i++) {
  const missing = run(
    `[...DRILL_BY_KEY['RFI_${RFI_ORDER[i]}'].sets.raise].filter((h) => !DRILL_BY_KEY['RFI_${RFI_ORDER[i + 1]}'].sets.raise.has(h))`,
  )
  check(missing.length === 0, `RFI ${RFI_ORDER[i]} ⊂ ${RFI_ORDER[i + 1]}`, missing.join(','))
}

check(run(`RFI_DRILLS.some((d) => d.hero === 'BB')`) === false, 'BB に RFI は存在しない')

// ---- vs RFI レンジ ----

// 調査が申告した値。これと自前の展開が一致するか。
const CLAIMED = {
  UTG_HJ: [8.1, 0], UTG_CO: [8.6, 0], UTG_BTN: [7.2, 6.3], UTG_SB: [7.2, 0], UTG_BB: [5.7, 21.1],
  HJ_CO: [10.1, 0], HJ_BTN: [8.7, 5.4], HJ_SB: [8.7, 0], HJ_BB: [7.4, 22.3],
  CO_BTN: [11.9, 5.1], CO_SB: [11.0, 0], CO_BB: [9.7, 23.2],
  BTN_SB: [15.1, 0], BTN_BB: [12.7, 38.0],
}

check(run('VS_RFI_DRILLS.length') === 14, 'vs RFI は 14 スポット')
check(run(`DRILL_BY_KEY['SB_BB'] === undefined`), 'BB vs SB は意図的に欠番 (前提が食い違うため)')

for (const [key, [claimedTb, claimedCall]] of Object.entries(CLAIMED)) {
  const overlap = run(`[...DRILL_BY_KEY['${key}'].sets.threebet].filter((h) => DRILL_BY_KEY['${key}'].sets.call.has(h))`)
  check(overlap.length === 0, `${key}: 3bet と call が重複しない`, overlap.join(','))

  const tb = run(`pctOf(DRILL_BY_KEY['${key}'].sets.threebet)`)
  const cl = run(`pctOf(DRILL_BY_KEY['${key}'].sets.call)`)
  check(Math.abs(tb - claimedTb) < 0.6, `${key}: 3bet ${tb.toFixed(1)}%`, `(申告 ${claimedTb}%)`)
  check(Math.abs(cl - claimedCall) < 0.6, `${key}: call ${cl.toFixed(1)}%`, `(申告 ${claimedCall}%)`)
}

// 不変条件: ヒーローの席ごとに、レイザーが後ろの席になるほどディフェンスが広がる
const OPENERS = ['UTG', 'HJ', 'CO', 'BTN']
for (const hero of ['HJ', 'CO', 'BTN', 'SB', 'BB']) {
  const chain = run(`
    ${JSON.stringify(OPENERS)}
      .map((o) => [o + '_${hero}', DRILL_BY_KEY[o + '_${hero}']])
      .filter(([, d]) => d)
      .map(([k, d]) => [k, 100 - d.foldBaseline])
  `)
  if (chain.length < 2) continue
  const widths = chain.map(([, v]) => v)
  const mono = widths.every((v, i) => i === 0 || v > widths[i - 1])
  check(mono, `${hero}: レイザーが後ろの席ほどディフェンスが広い`, chain.map(([k, v]) => `${k}=${v.toFixed(0)}%`).join(' < '))
}

// SB は 3bet オアフォールド (フラットを作らない)
const sbFlats = run(`VS_RFI_DRILLS.filter((d) => d.hero === 'SB' && d.sets.call.size > 0).map((d) => d.key)`)
check(sbFlats.length === 0, 'SB は全スポットで 3bet オアフォールド', sbFlats.join(','))

// BB は広く守る
for (const key of ['UTG_BB', 'HJ_BB', 'CO_BB', 'BTN_BB']) {
  const defense = run(`100 - DRILL_BY_KEY['${key}'].foldBaseline`)
  check(defense > 25, `${key}: BB のディフェンスが十分広い`, `${defense.toFixed(0)}%`)
}
check(run(`100 - DRILL_BY_KEY['BTN_BB'].foldBaseline`) > 45, 'BTN_BB: BB は BTN のスチールに半分近く抵抗する')

// ---- ドリルの整合性 ----

const drillConsistency = run(`(() => {
  const bad = []
  for (const drill of DRILLS) {
    // answerFor が返す action は、そのドリルで選べる action のどれかでなければならない
    const allowed = new Set(drill.actions.map((a) => a.id))
    for (const hand of UNIQUE_HANDS) {
      if (!allowed.has(drill.answerFor(hand))) bad.push(drill.key + ':' + hand)
    }
    // foldBaseline は「fold が正解のハンドの combos 比」と一致しなければならない
    const foldCombos = UNIQUE_HANDS
      .filter((h) => drill.answerFor(h) === 'fold')
      .reduce((s, h) => s + combosOf(h), 0)
    const pct = (foldCombos / TOTAL_COMBOS) * 100
    if (Math.abs(pct - drill.foldBaseline) > 0.01) bad.push(drill.key + ':baseline')
  }
  return bad
})()`)
check(drillConsistency.length === 0, '全ドリルで answerFor と foldBaseline が整合', drillConsistency.slice(0, 5).join(','))

// ---- グリッドと分類 ----

check(run('ALL_HANDS.length') === 169, '13x13 グリッドは 169 マス')
check(run('UNIQUE_HANDS.reduce((s, h) => s + combosOf(h), 0)') === 1326, '169 ハンドの combos 合計 = 1326')
check(run('UNIQUE_HANDS.filter((h) => !categoryOf(h)).length') === 0, '全ハンドが分類される')

const boundaryBad = run(`BOUNDARY_HANDS.filter((h) => {
  const n = RFI_DRILLS.filter((d) => d.sets.raise.has(h)).length
  return n === 0 || n === RFI_DRILLS.length
})`)
check(run('BOUNDARY_HANDS.length') > 0, '境界ハンドが存在する', `${run('BOUNDARY_HANDS.length')} ハンド`)
check(boundaryBad.length === 0, '境界ハンドに「常にレイズ/常にフォールド」が混ざっていない', boundaryBad.join(','))

// ---- モードごとの出題範囲 ----

const modeDraws = run(`(() => {
  const out = {}
  for (const mode of MODES) {
    const keys = new Set()
    const hands = new Set()
    for (let i = 0; i < 6000; i++) {
      const q = drawFresh(mode.id)
      keys.add(q.drillKey)
      hands.add(q.hand)
    }
    out[mode.id] = {
      keys: [...keys],
      allowed: mode.drills().map((d) => d.key),
      hands: hands.size,
    }
  }
  return out
})()`)

for (const [modeId, info] of Object.entries(modeDraws)) {
  const outside = info.keys.filter((k) => !info.allowed.includes(k))
  check(outside.length === 0, `モード ${modeId}: 担当外のドリルを出さない`, outside.join(','))
  check(
    info.keys.length === info.allowed.length,
    `モード ${modeId}: 担当ドリルを全部出す`,
    `${info.keys.length}/${info.allowed.length}`,
  )
}
check(modeDraws.boundary.hands === run('BOUNDARY_HANDS.length'), '境界モードは境界ハンドだけを出す', `${modeDraws.boundary.hands} 種`)
check(modeDraws.rfi.hands === 169, 'RFI モードは 169 ハンド全部を出す')

// ---- 出現頻度 ----

const freq = run(`(() => {
  const N = 200000
  const counts = {}
  for (let i = 0; i < N; i++) {
    const h = drawWeightedHand()
    counts[h] = (counts[h] || 0) + 1
  }
  return { N, counts }
})()`)
for (const hand of ['AA', 'AKs', 'AKo']) {
  const observed = (freq.counts[hand] / freq.N) * 100
  const expected = run(`(combosOf('${hand}') / TOTAL_COMBOS) * 100`)
  check(Math.abs(observed - expected) < 0.15, `${hand} の出現率 ${observed.toFixed(2)}%`, `(期待 ${expected.toFixed(2)}%)`)
}

// ---- 採点 ----

const gradeCases = [
  ['RFI_UTG', 'AA', 'raise'],
  ['RFI_UTG', '72o', 'fold'],
  ['RFI_UTG', '22', 'raise'],
  ['RFI_BTN', '98o', 'raise'],
  ['RFI_UTG', '98o', 'fold'],
  ['UTG_BB', 'AA', 'threebet'],
  ['UTG_BB', '72o', 'fold'],
  ['UTG_SB', '77', 'fold'], // SB は UTG 相手に 99+ しか 3bet しない (コールもない)
]
for (const [key, hand, expected] of gradeCases) {
  const got = run(`gradeAnswer({ drillKey: '${key}', hand: '${hand}' }, '${expected}')`)
  check(got.isCorrect && got.correctAction === expected, `採点 ${key} ${hand} → ${expected}`, `(実際 ${got.correctAction})`)
}

// ---- state ----

check(
  run(`(() => {
    const before = freshState()
    const snap = JSON.stringify(before)
    recordAnswer(before, { drillKey: 'RFI_BTN', hand: 'AA', chosenAction: 'raise', correctAction: 'raise', isCorrect: true })
    return JSON.stringify(before) === snap
  })()`),
  'recordAnswer が元の state を破壊しない',
)

const drive = (modeId, pick, n) => run(`(() => {
  let s = { ...freshState(), mode: '${modeId}' }
  for (let i = 0; i < ${n}; i++) {
    const { question, reviewQueue } = takeQuestion(s)
    s = { ...s, reviewQueue }
    const drill = DRILL_BY_KEY[question.drillKey]
    const correct = drill.answerFor(question.hand)
    const chosen = (${pick})(drill, correct)
    const g = gradeAnswer(question, chosen)
    s = recordAnswer(s, {
      drillKey: question.drillKey,
      hand: question.hand,
      chosenAction: chosen,
      correctAction: g.correctAction,
      isCorrect: g.isCorrect,
    })
  }
  return {
    rates: DRILLS.map((d) => [d.key, drillRate(s, d.key)]),
    streak: s.streak.current,
    queue: s.reviewQueue.length,
    leaks: findLeaks(s).length,
    tendency: overallTendency(s),
  }
})()`)

const perfect = drive('mixed', '(d, correct) => correct', 900)
check(perfect.rates.every(([, r]) => r === null || r === 1), '正解を打ち続けると全ドリル 100%')
check(perfect.streak === 900, '連続正解が積み上がる', String(perfect.streak))
check(perfect.queue === 0 && perfect.leaks === 0, '全問正解なら復習キューも弱点も空')

// 常に一番強い action を押す = 手が出すぎ と診断されるはず
const alwaysAggro = drive('mixed', '(d) => d.actions[0].id', 400)
check((alwaysAggro.tendency || '').includes('手が出すぎ'), '強い action の連打は「手が出すぎ」と診断される', alwaysAggro.tendency || '(なし)')
check(alwaysAggro.leaks > 0, '連打で弱点が検出される', `${alwaysAggro.leaks} 件`)

// 常にフォールド = 消極的
const alwaysFold = drive('mixed', '() => "fold"', 400)
check((alwaysFold.tendency || '').includes('消極的'), 'フォールド連打は「消極的」と診断される', alwaysFold.tendency || '(なし)')

// 基準 (foldBaseline) の定義確認: 復習キューを挟まない素の出題を全部フォールドすると基準値に張り付く
const foldFresh = run(`(() => {
  const tally = {}
  for (const d of DRILLS) tally[d.key] = { asked: 0, correct: 0 }
  for (let i = 0; i < 40000; i++) {
    const q = drawFresh('mixed')
    const drill = DRILL_BY_KEY[q.drillKey]
    tally[q.drillKey].asked++
    if (drill.answerFor(q.hand) === 'fold') tally[q.drillKey].correct++
  }
  return DRILLS.map((d) => [d.key, (tally[d.key].correct / tally[d.key].asked) * 100, d.foldBaseline])
})()`)
const baselineOff = foldFresh.filter(([, observed, baseline]) => Math.abs(observed - baseline) > 3)
check(baselineOff.length === 0, '全ドリルで「素の出題をフォールド連打 = 基準値」', baselineOff.map(([k]) => k).join(','))

// ---- 復習キュー ----

const review = run(`(() => {
  let s = { ...freshState(), mode: 'mixed' }
  for (let i = 0; i < 15; i++) {
    const { question, reviewQueue } = takeQuestion(s)
    s = { ...s, reviewQueue }
    const drill = DRILL_BY_KEY[question.drillKey]
    const correct = drill.answerFor(question.hand)
    const wrong = drill.actions.map((a) => a.id).find((a) => a !== correct)
    s = recordAnswer(s, {
      drillKey: question.drillKey,
      hand: question.hand,
      chosenAction: wrong,
      correctAction: correct,
      isCorrect: false,
    })
  }
  const queued = s.reviewQueue.length
  const valid = s.reviewQueue.every((it) => DRILL_BY_KEY[it.drillKey] && UNIQUE_HANDS.includes(it.hand))
  let drawn = 0
  for (let i = 0; i < 400 && s.reviewQueue.length > 0; i++) {
    const { question, reviewQueue } = takeQuestion(s)
    s = { ...s, reviewQueue }
    if (question.isReview) drawn++
  }
  return { queued, valid, drawn, drained: s.reviewQueue.length }
})()`)
check(review.queued > 0 && review.queued <= 15, 'ミスした問題が復習キューに入る', `${review.queued} 件`)
check(review.valid, '復習キューの中身が壊れていない')
check(review.drawn > 0 && review.drained === 0, '復習キューが再出題され、最終的に消化される')

// ---- カード表示 ----

const cardCheck = run(`(() => {
  const r = { ranks: true, suitedSame: true, offsuitDiff: true, pairDiff: true }
  for (let i = 0; i < 3000; i++) {
    const hand = drawWeightedHand()
    const [a, b] = dealCards(hand)
    if (a.rank !== hand[0] || b.rank !== hand[1]) r.ranks = false
    if (isPair(hand) && a.suit.id === b.suit.id) r.pairDiff = false
    if (!isPair(hand) && isSuited(hand) && a.suit.id !== b.suit.id) r.suitedSame = false
    if (!isPair(hand) && !isSuited(hand) && a.suit.id === b.suit.id) r.offsuitDiff = false
  }
  return r
})()`)
check(cardCheck.ranks, 'カードのランクがハンド表記と一致する')
check(cardCheck.suitedSame, 'スーテッドは同じスートで描かれる')
check(cardCheck.offsuitDiff, 'オフスーツは違うスートで描かれる')
check(cardCheck.pairDiff, 'ペアは違うスート2枚 (同じカードは存在しない)')

// ---- 永続化 ----

check(
  run(`(() => {
    let s = freshState()
    s = recordAnswer(s, { drillKey: 'BTN_BB', hand: 'AA', chosenAction: 'threebet', correctAction: 'threebet', isCorrect: true })
    saveState(s)
    const back = loadState()
    return back.byDrill.BTN_BB.asked === 1 && back.streak.best === 1
  })()`),
  'localStorage に保存して読み戻せる',
)

check(
  run(`(() => {
    localStorage.setItem('poker-range-trainer/v3', '{ broken json')
    const s = loadState()
    return s.version === 3 && s.history.length === 0
  })()`),
  '壊れた保存データは黙って初期化される',
)

check(
  run(`(() => {
    // 未知のドリルが混ざった古い保存でも落ちない
    localStorage.setItem('poker-range-trainer/v3', JSON.stringify({
      version: 3, byDrill: { GONE_SPOT: { asked: 3, correct: 1 } }, byCategory: {},
      streak: { current: 0, best: 2 }, history: [1, 0], reviewQueue: [{ drillKey: 'GONE_SPOT', hand: 'AA' }],
      soundOn: true, mode: 'rfi',
    }))
    const s = loadState()
    return s.reviewQueue.length === 0 && s.byDrill.RFI_UTG.asked === 0 && s.streak.best === 2
  })()`),
  '消えたドリルを含む古い保存を安全に読み直す',
)

// ---- 狙い撃ち (focus) ----

// focus 中はそのスポットしか出ない
const focusDraws = run(`(() => {
  const keys = new Set()
  for (let i = 0; i < 3000; i++) keys.add(drawFresh('rfi', 'RFI_SB').drillKey)
  return [...keys]
})()`)
check(focusDraws.length === 1 && focusDraws[0] === 'RFI_SB', 'focus 中はそのスポットだけが出る', focusDraws.join(','))

// モードに含まれないスポットを focus しても出せる (main.js がモードを合わせる)
const crossMode = run(`(() => {
  selectFocus('BTN_BB')       // RFI モードのまま 3ベットのスポットを狙い撃つ
  const mode = state.mode
  const keys = new Set()
  for (let i = 0; i < 500; i++) keys.add(drawFresh(state.mode, state.focus).drillKey)
  const result = { mode, keys: [...keys] }
  selectFocus('BTN_BB')       // トグルで解除
  return { ...result, clearedFocus: state.focus }
})()`)
check(crossMode.mode === 'vsrfi', 'RFI モードから 3ベットのスポットを狙うとモードが追随する', crossMode.mode)
check(
  crossMode.keys.length === 1 && crossMode.keys[0] === 'BTN_BB',
  'モードをまたいだ focus でも正しいスポットが出る',
  crossMode.keys.join(','),
)
check(crossMode.clearedFocus === null, 'もう一度押すと focus が解除される (トグル)')

// モードを切り替えると focus は解除される (RFI を狙ったまま 3ベットへ行くと出題が壊れる)
const modeSwitch = run(`(() => {
  selectFocus('RFI_SB')
  const before = state.focus
  selectMode('vsrfi')
  return { before, after: state.focus, mode: state.mode }
})()`)
check(modeSwitch.before === 'RFI_SB' && modeSwitch.after === null, 'モード切替で focus が解除される')

// focus 中の復習キューは、そのスポットのものだけを拾う
const focusReview = run(`(() => {
  let s = { ...freshState(), mode: 'rfi', focus: 'RFI_SB', reviewQueue: [
    { drillKey: 'RFI_UTG', hand: 'AA' },
    { drillKey: 'RFI_SB', hand: 'K5o' },
  ] }
  const drawn = []
  for (let i = 0; i < 400; i++) {
    const r = takeQuestion({ ...s })
    if (r.question.isReview) drawn.push(r.question.drillKey)
  }
  return { drawn: [...new Set(drawn)] }
})()`)
check(
  focusReview.drawn.length > 0 && focusReview.drawn.every((k) => k === 'RFI_SB'),
  'focus 中は他スポットの復習が割り込まない',
  focusReview.drawn.join(','),
)

// 後片付け: 以降のチェックに focus を持ち越さない
run(`commit({ ...state, focus: null, mode: 'rfi' })`)

// ---- レンジの育ち方 ----

check(run('RFI_STEPS.length') === 5, '育ち方は 5 ステップ')

// 各ステップの added / removed を前の席に適用すると、その席のレンジが再構成できる
const rebuilt = run(`(() => {
  const bad = []
  let acc = new Set()
  for (const step of RFI_STEPS) {
    for (const h of step.removed) acc.delete(h)
    for (const h of step.added) acc.add(h)
    const target = DRILL_BY_KEY[step.key].sets.raise
    if (acc.size !== target.size || [...target].some((h) => !acc.has(h))) bad.push(step.key)
  }
  return bad
})()`)
check(rebuilt.length === 0, 'added/removed を順に適用すると各席のレンジが再構成できる', rebuilt.join(','))

// UTG→BTN は純粋な追加のみ (消える手がない)
const cleanChain = run(`RFI_STEPS.slice(0, 4).filter((s) => s.removed.size > 0).map((s) => s.key)`)
check(cleanChain.length === 0, 'UTG → HJ → CO → BTN では手が消えない', cleanChain.join(','))

// SB では実際に手が消える (これを隠すと「後ろほど広い」と誤って一般化してしまう)
const sbRemoved = run(`[...RFI_STEPS[4].removed]`)
check(sbRemoved.length > 0, 'SB は BTN の上位互換ではない (消える手がある)', sbRemoved.join(','))

// 消えると主張する手が、本当に BTN にあって SB にないこと
const sbRemovedReal = run(`
  [...RFI_STEPS[4].removed].every(
    (h) => DRILL_BY_KEY['RFI_BTN'].sets.raise.has(h) && !DRILL_BY_KEY['RFI_SB'].sets.raise.has(h),
  )
`)
check(sbRemovedReal, 'SB で消えると表示する手が、実際に BTN にあって SB にない')

// ---- UI: 回答パスを実際に通す ----
// main.js の answer() を叩いて、バナー / ボタンの色付け / 次へボタンまで描かれることを確認する。

const uiFlow = run(`(() => {
  // 出題中のドリルを掴んで、正解と不正解を1回ずつ通す
  const drill = DRILL_BY_KEY[current.drillKey]
  const correct = drill.answerFor(current.hand)
  const wrong = drill.actions.map((a) => a.id).find((a) => a !== correct)

  answer(correct)
  const okBanner = {
    hidden: el.verdict.hidden,
    cls: el.banner.className,
    mark: el.bannerMark.textContent,
    text: el.bannerText.textContent,
    marks: el.actions.children.map((b) => [b.dataset.action, [...b.classList._set].filter((c) => c.startsWith('is-'))]),
  }

  advance()
  const drill2 = DRILL_BY_KEY[current.drillKey]
  const correct2 = drill2.answerFor(current.hand)
  const wrong2 = drill2.actions.map((a) => a.id).find((a) => a !== correct2)
  answer(wrong2)
  const ngBanner = {
    cls: el.banner.className,
    mark: el.bannerMark.textContent,
    marks: el.actions.children.map((b) => [b.dataset.action, [...b.classList._set].filter((c) => c.startsWith('is-'))]),
    chosen: wrong2,
    correct: correct2,
  }

  return { okBanner, ngBanner }
})()`)

check(uiFlow.okBanner.hidden === false, '回答すると判定エリアが表示される')
check(uiFlow.okBanner.cls.includes('ok'), '正解時のバナーが ok になる', uiFlow.okBanner.cls)
check(uiFlow.okBanner.mark === '正解', '正解時のバナー文言', uiFlow.okBanner.mark)
check(uiFlow.ngBanner.cls.includes('ng'), '不正解時のバナーが ng になる', uiFlow.ngBanner.cls)
check(uiFlow.ngBanner.mark === '不正解', '不正解時のバナー文言', uiFlow.ngBanner.mark)

// 正解のボタンは is-correct、押した不正解のボタンは is-wrong が付く
const okMark = uiFlow.okBanner.marks.find(([, cls]) => cls.includes('is-correct'))
check(Boolean(okMark), '正解時: 正解ボタンに is-correct が付く', JSON.stringify(uiFlow.okBanner.marks))

const ngCorrect = uiFlow.ngBanner.marks.find(([id]) => id === uiFlow.ngBanner.correct)
const ngChosen = uiFlow.ngBanner.marks.find(([id]) => id === uiFlow.ngBanner.chosen)
check(
  ngCorrect && ngCorrect[1].includes('is-correct'),
  '不正解時: 正解のボタンが緑になる',
  JSON.stringify(uiFlow.ngBanner.marks),
)
check(
  ngChosen && ngChosen[1].includes('is-wrong'),
  '不正解時: 自分が押したボタンが赤になる',
  JSON.stringify(uiFlow.ngBanner.marks),
)

// 次の問題に進むと色付けがリセットされる
const cleared = run(`(() => {
  advance()
  return el.actions.children.every((b) => ![...b.classList._set].some((c) => c.startsWith('is-')))
})()`)
check(cleared, '次の問題に進むとボタンの色付けが消える')

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
