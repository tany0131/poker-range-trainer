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
  Date, // 日替わりメニューが「今日」を数えるのに要る
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
  'js/coach.js',
  'js/coach-easy.js',
  'js/cards.js',
  'js/stats.js',
  'js/daily.js',
  'js/glossary.js',
  'js/faq.js',
  'js/tips.js',
  'js/equity.js',
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

// 基準 (foldBaseline) の定義確認: 復習キューを挟まない素の出題を全部フォールドすると基準値に張り付く。
//
// ドリルごとに独立して引く。'mixed' から引くと 1 ドリルあたりのサンプルが 1/19 に薄まり、
// ばらつきで稀に閾値を割ってしまう (検証がランダムに落ちる = 出荷ゲートとして使いものにならない)。
const FOLD_SAMPLES = 20000
const FOLD_TOLERANCE = 1.5 // 20000 引けば標準誤差は 0.4pt 未満なので、これは 4 シグマ相当

const foldFresh = run(`(() => {
  return DRILLS.map((drill) => {
    let folds = 0
    for (let i = 0; i < ${FOLD_SAMPLES}; i++) {
      if (drill.answerFor(drawWeightedHand()) === 'fold') folds++
    }
    return [drill.key, (folds / ${FOLD_SAMPLES}) * 100, drill.foldBaseline]
  })
})()`)
const baselineOff = foldFresh.filter(
  ([, observed, baseline]) => Math.abs(observed - baseline) > FOLD_TOLERANCE,
)
check(
  baselineOff.length === 0,
  '全ドリルで「素の出題をフォールド連打 = 基準値」',
  baselineOff.map(([k, o, b]) => `${k} ${o.toFixed(1)}% vs ${b.toFixed(1)}%`).join(','),
)

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

// 復習キューはモードをまたいで貯まる。今のモードで出せない復習を引いてはいけない
// (サイズモードにカード付きのレンジ問題が出る / RFI モードに bb の4択が出る、という事故)。
const reviewLeak = run(`(() => {
  // 全モードぶんの復習を1つのキューに詰めて、各モードで大量に引いてみる
  const queue = [
    { drillKey: 'RFI_UTG', hand: 'AA' },      // 境界ハンドではない RFI
    { drillKey: 'RFI_BTN', hand: '98o' },     // 境界ハンド
    { drillKey: 'BTN_BB', hand: 'KTo' },      // vs RFI
    { drillKey: 'SIZE_RFI_SB', hand: null },  // サイズ
    { drillKey: 'SIZE_BTN_BB', hand: null },
  ]
  const out = {}
  for (const mode of MODES) {
    const s = { ...freshState(), mode: mode.id, reviewQueue: queue }
    const allowed = new Set(mode.drills().map((d) => d.key))
    const bad = []
    for (let i = 0; i < 3000; i++) {
      const { question } = takeQuestion(s)
      if (!question.isReview) continue
      if (!allowed.has(question.drillKey)) bad.push('drill:' + question.drillKey)
      if (mode.boundaryOnly && !BOUNDARY_HAND_SET.has(question.hand)) bad.push('hand:' + question.hand)
      // サイズの出題にハンドが乗っていない / レンジの出題にハンドがある
      const isSizing = DRILL_BY_KEY[question.drillKey].type === 'sizing'
      if (isSizing !== (question.hand === null)) bad.push('shape:' + question.drillKey + ':' + question.hand)
    }
    out[mode.id] = [...new Set(bad)]
  }
  return out
})()`)
for (const [modeId, bad] of Object.entries(reviewLeak)) {
  check(bad.length === 0, `モード ${modeId}: 担当外の復習を引かない`, bad.slice(0, 3).join(','))
}

// 逆に、そのモードで出せる復習はちゃんと引ける (絞りすぎて復習が死んでいない)
const reviewAlive = run(`(() => {
  const out = {}
  for (const [modeId, item] of [
    ['rfi', { drillKey: 'RFI_UTG', hand: 'AA' }],
    ['boundary', { drillKey: 'RFI_BTN', hand: '98o' }],
    ['vsrfi', { drillKey: 'BTN_BB', hand: 'KTo' }],
    ['sizing', { drillKey: 'SIZE_BTN_BB', hand: null }],
    ['mixed', { drillKey: 'BTN_BB', hand: 'KTo' }],
  ]) {
    const s = { ...freshState(), mode: modeId, reviewQueue: [item] }
    let drawn = 0
    for (let i = 0; i < 200; i++) if (takeQuestion(s).question.isReview) drawn++
    out[modeId] = drawn
  }
  return out
})()`)
for (const [modeId, drawn] of Object.entries(reviewAlive)) {
  check(drawn > 0, `モード ${modeId}: そのモードの復習はちゃんと引ける`, `${drawn} 回`)
}

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

// ---- コーチ (間違えた時の「なぜ」と「覚え方」) ----

// 全ドリル × 全ハンドで、なぜ/覚え方が必ず導出できる (空文字や例外がない)
const coachGaps = run(`(() => {
  const bad = []
  for (const drill of DRILLS) {
    for (const hand of UNIQUE_HANDS) {
      try {
        const advice = coachFor(drill, hand)
        if (!advice.why || !advice.tip) bad.push(drill.key + ':' + hand)
      } catch (e) {
        bad.push(drill.key + ':' + hand + ':' + e.message)
      }
    }
  }
  return bad
})()`)
check(coachGaps.length === 0, '全ドリル × 全ハンドでコーチ文が導出できる', coachGaps.slice(0, 5).join(','))

// なぜ: 代表ケースの内容がレンジデータと整合した説明になっている
const coachCases = [
  ['RFI_UTG', 'AA', '全席'], // 全席レイズ
  ['RFI_UTG', '72o', 'どの席からも'], // 全席フォールド
  ['RFI_UTG', '98o', 'BTN'], // 開けるのは BTN だけ → 最初に開ける席を言う
  ['RFI_SB', 'Q3s', '後ろの席ほど広い'], // SB で消える 7 ハンド → 例外であることを言う
  ['UTG_SB', '77', 'コール'], // SB は 3bet オアフォールド
  ['UTG_BB', '76s', 'BB'], // BB のディフェンス理由
  ['UTG_BTN', 'A4s', 'ブロック'], // ホイールエースはブロッカー付きブラフ枠
  ['UTG_SB', 'KJo', 'ドミネート'], // オフスーツブロードウェイの罠
]
for (const [key, hand, needle] of coachCases) {
  const why = run(`coachFor(DRILL_BY_KEY['${key}'], '${hand}').why`)
  check(why.includes(needle), `コーチ ${key} ${hand}: なぜ に「${needle}」`, why)
}

// 覚え方: RFI は席ごとの ○✕ 一覧、境界ハンドなら両方の記号が出る
const rfiTipLine = run(`coachFor(DRILL_BY_KEY['RFI_UTG'], '98o').tip`)
check(rfiTipLine.includes('○') && rfiTipLine.includes('✕'), 'コーチ RFI: 境界ハンドの覚え方に ○ と ✕ が並ぶ', rfiTipLine)

// 覚え方の ○✕ が実際のレンジと一致する (UTG ✕ / BTN ○ の 98o)
check(rfiTipLine.includes('UTG ✕') && rfiTipLine.includes('BTN ○'), 'コーチ RFI: ○✕ がレンジと一致する', rfiTipLine)

// オフスーツでつまずいたら「スーテッドは格上げ」を思い出させる
const suitedContrast = run(`coachFor(DRILL_BY_KEY['RFI_UTG'], 'J9o').tip`)
check(suitedContrast.includes('J9s'), 'コーチ RFI: オフスーツにはスーテッド版との対比が付く', suitedContrast)

// vs RFI の覚え方: 同じ席でレイザー別の答えを並べ、実際の答えと一致する
const vsTip = run(`coachFor(DRILL_BY_KEY['UTG_BB'], 'KTo').tip`)
const vsTipTruth = run(`
  VS_RFI_DRILLS.filter((d) => d.hero === 'BB').map((d) => d.raiser + '=' + d.answerFor('KTo'))
`)
check(vsTip.includes('vs UTG') && vsTip.includes('vs BTN'), 'コーチ vs RFI: レイザー別の一覧が出る', vsTip)
check(
  vsTipTruth.every((pair) => {
    const [raiser, action] = pair.split('=')
    const short = { threebet: '3ベット', call: 'コール', fold: '降り' }[action]
    return vsTip.includes(`vs ${raiser} ${short}`)
  }),
  'コーチ vs RFI: 一覧の中身が answerFor と一致する',
  vsTip,
)

// スポットが1つしかない席 (HJ) はレイザー固定で席ごとの違いを見せる
const hjTip = run(`coachFor(DRILL_BY_KEY['UTG_HJ'], 'AQs').tip`)
check(hjTip.includes('BB') && hjTip.includes('BTN'), 'コーチ vs RFI: HJ は席ごとの一覧にフォールバックする', hjTip)

// ---- bb とポット (「7.5bb って何」に答えられているか) ----

check(run('STACK_BB') === 100, '全スポット 100bb スタート')
check(run('BLIND_POT') === 1.5, '手が始まった時点のポットは 1.5bb (SB 0.5 + BB 1)')

// RFI は誰も開けていないのでポット 1.5bb、vs RFI は +2.5bb で 4bb
check(
  run(`RFI_DRILLS.every((d) => potBefore(d) === 1.5)`),
  'RFI のポットは 1.5bb (ブラインドだけ)',
)
check(
  run(`VS_RFI_DRILLS.every((d) => potBefore(d) === 4)`),
  'vs RFI のポットは 4bb (ブラインド 1.5 + オープン 2.5)',
)
check(
  run(`SIZING_DRILLS.every((d) => potBefore(d) === (d.raiser ? 4 : 1.5))`),
  'サイズのドリルも同じポット計算になる',
)

// ブラインドはすでに払い込んでいるので、実際に出す額は差額
const chipsCases = [
  ['SIZE_UTG_BB', '10bb', 9], // BB は 1bb 出しているので +9bb
  ['SIZE_UTG_SB', '10bb', 9.5], // SB は 0.5bb 出しているので +9.5bb
  ['SIZE_CO_BTN', '7.5bb', 7.5], // BTN はまだ何も出していない
  ['SIZE_RFI_SB', '3bb', 2.5], // SB のオープン 3bb は、0.5 を差し引いて +2.5bb
  ['SIZE_RFI_UTG', '2.5bb', 2.5],
]
for (const [key, size, expected] of chipsCases) {
  const got = run(`chipsToPut(DRILL_BY_KEY['${key}'], '${size}')`)
  check(got === expected, `${key}: ${size} にするのに実際に出すのは ${expected}bb`, `(実際 ${got}bb)`)
}

check(run(`fmtBb(7.5) === '7.5bb' && fmtBb(9) === '9bb' && fmtBb(1.5) === '1.5bb'`), 'bb 表記に余計な小数が付かない')

// ---- サイズ ----

check(run('SIZING_DRILLS.length') === 19, 'サイズは全 19 スポットぶんある', String(run('SIZING_DRILLS.length')))
check(run('ALL_DRILLS.length') === 38, 'ALL_DRILLS = レンジ 19 + サイズ 19')
check(run(`DRILLS.every((d) => d.type !== 'sizing')`), 'DRILLS (弱点分析が回る側) にサイズは混ざらない')

// 教えている規則そのもの: オープン 2.5bb (SB だけ 3bb) / 3ベット IP 7.5bb・OOP 10bb
const sizingAnswers = run(`SIZING_DRILLS.map((d) => [d.key, d.hero, d.raiser, d.answer])`)
const sizingBad = sizingAnswers.filter(([, hero, raiser, answer]) => {
  const expected = raiser === null
    ? hero === 'SB' ? '3bb' : '2.5bb'
    : hero === 'SB' || hero === 'BB' ? '10bb' : '7.5bb'
  return answer !== expected
})
check(sizingBad.length === 0, 'サイズ: オープン 2.5bb (SB 3bb) / 3bet IP 7.5bb・OOP 10bb', sizingBad.map(([k]) => k).join(','))

// IP/OOP の判定がフロップ以降の行動順から出ていること (ブラインドだけが OOP になる)
const oopHeroes = run(`VS_RFI_DRILLS.filter((d) => !isHeroInPosition(d.hero, d.raiser)).map((d) => d.hero)`)
check(
  oopHeroes.every((h) => h === 'SB' || h === 'BB') && oopHeroes.length > 0,
  'サイズ: vs RFI で OOP になるのはブラインドだけ',
  [...new Set(oopHeroes)].join(','),
)

// 正解が必ず選択肢の中にある / 当てずっぽうの基準が 25%
const sizingOptionBad = run(`SIZING_DRILLS.filter((d) => !d.actions.some((a) => a.id === d.answer)).map((d) => d.key)`)
check(sizingOptionBad.length === 0, 'サイズ: 正解が必ず選択肢に含まれる', sizingOptionBad.join(','))
check(
  run(`SIZING_DRILLS.every((d) => d.actions.length === 4 && Math.abs(d.foldBaseline - 25) < 0.01)`),
  'サイズ: 4択で、当てずっぽうの基準が 25%',
)

// サイズの出題はハンドを配らない
const sizingDraws = run(`(() => {
  const hands = new Set()
  const keys = new Set()
  for (let i = 0; i < 2000; i++) {
    const q = drawFresh('sizing')
    hands.add(q.hand)
    keys.add(q.drillKey)
  }
  return { hands: [...hands], keyCount: keys.size }
})()`)
check(
  sizingDraws.hands.length === 1 && sizingDraws.hands[0] === null,
  'サイズの出題はハンドを配らない (額は手に依存しないため)',
  JSON.stringify(sizingDraws.hands.slice(0, 3)),
)
check(sizingDraws.keyCount === 19, 'サイズモードは 19 スポット全部を出す', String(sizingDraws.keyCount))

// 採点はハンドに依存しない (どんな hand を渡しても同じ答え)
check(
  run(`(() => {
    const d = DRILL_BY_KEY['SIZE_CO_BTN']
    return ['AA', '72o', null].every((h) => gradeAnswer({ drillKey: 'SIZE_CO_BTN', hand: h }, '7.5bb').isCorrect)
  })()`),
  'サイズの採点はハンドに依存しない',
)

// サイズを間違えても「消極的 / 手が出すぎ」の弱点分析を汚さない (額に強弱の一直線がないため)
const sizingNoLeak = run(`(() => {
  let s = freshState()
  for (const d of SIZING_DRILLS) {
    const wrong = d.actions.map((a) => a.id).find((a) => a !== d.answer)
    for (let i = 0; i < 10; i++) {
      s = recordAnswer(s, { drillKey: d.key, hand: null, chosenAction: wrong, correctAction: d.answer, isCorrect: false })
    }
  }
  return { tendency: overallTendency(s), leaks: findLeaks(s).length, asked: s.byDrill['SIZE_RFI_UTG'].asked }
})()`)
check(sizingNoLeak.tendency === null, 'サイズのミスは「消極的/手が出すぎ」の診断を汚さない', String(sizingNoLeak.tendency))
check(sizingNoLeak.leaks === 0, 'サイズのミスはハンド分類の弱点に出ない', `${sizingNoLeak.leaks} 件`)
check(sizingNoLeak.asked === 10, 'サイズも成績 (byDrill) には数える', String(sizingNoLeak.asked))

// サイズのコーチ文
const sizeCoachSb = run(`coachFor(DRILL_BY_KEY['SIZE_RFI_SB'], null).why`)
check(sizeCoachSb.includes('1bb'), 'コーチ サイズ: SB の 3bb は「BB がすでに 1bb 出している」で説明する', sizeCoachSb)
const sizeCoachOop = run(`coachFor(DRILL_BY_KEY['SIZE_UTG_BB'], null).why`)
check(sizeCoachOop.includes('OOP') && sizeCoachOop.includes('4x'), 'コーチ サイズ: OOP は 4x と説明する', sizeCoachOop)
const sizeCoachIp = run(`coachFor(DRILL_BY_KEY['SIZE_CO_BTN'], null).why`)
check(sizeCoachIp.includes('IP') && sizeCoachIp.includes('3x'), 'コーチ サイズ: IP は 3x と説明する', sizeCoachIp)

// ---- ハンド別成績と苦手 ----

// recordAnswer がハンド別に数える (サイズの hand=null は数えない)
const byHandFlow = run(`(() => {
  let s = freshState()
  s = recordAnswer(s, { drillKey: 'RFI_UTG', hand: 'KTo', chosenAction: 'raise', correctAction: 'fold', isCorrect: false })
  s = recordAnswer(s, { drillKey: 'RFI_UTG', hand: 'KTo', chosenAction: 'fold', correctAction: 'fold', isCorrect: true })
  s = recordAnswer(s, { drillKey: 'SIZE_RFI_UTG', hand: null, chosenAction: '2bb', correctAction: '2.5bb', isCorrect: false })
  return { rec: s.byHand.RFI_UTG.KTo, sizing: s.byHand.SIZE_RFI_UTG || null }
})()`)
check(byHandFlow.rec.a === 2 && byHandFlow.rec.w === 1, 'ハンド別成績が数えられる', JSON.stringify(byHandFlow.rec))
check(byHandFlow.sizing === null, 'サイズ (hand=null) はハンド別成績に入らない')

// 苦手の定義: ミスより2回多く正解したら卒業
const weakFlow = run(`(() => {
  let s = freshState()
  const record = (ok) => {
    s = recordAnswer(s, { drillKey: 'RFI_UTG', hand: 'KTo', chosenAction: ok ? 'fold' : 'raise', correctAction: 'fold', isCorrect: ok })
  }
  record(false)
  const afterMiss = weakHands(s).length
  record(true)
  record(true)
  const beforeGraduate = weakHands(s).length
  record(true)
  const afterGraduate = weakHands(s).length
  return { afterMiss, beforeGraduate, afterGraduate }
})()`)
check(weakFlow.afterMiss === 1, 'ミスすると苦手に入る', String(weakFlow.afterMiss))
check(weakFlow.beforeGraduate === 1, '正解がミス+2回に届くまでは苦手のまま', String(weakFlow.beforeGraduate))
check(weakFlow.afterGraduate === 0, 'ミスより2回多く正解すると卒業する', String(weakFlow.afterGraduate))

// 苦手モード: プールがあればそこから出し、空なら普通に出る
const weaknessDraw = run(`(() => {
  let s = { ...freshState(), mode: 'weakness' }
  s = recordAnswer(s, { drillKey: 'RFI_UTG', hand: 'KTo', chosenAction: 'raise', correctAction: 'fold', isCorrect: false })
  s = recordAnswer(s, { drillKey: 'BTN_BB', hand: '76s', chosenAction: 'fold', correctAction: 'call', isCorrect: false })
  const seen = new Set()
  for (let i = 0; i < 500; i++) {
    const q = drawFresh('weakness', null, s)
    seen.add(q.drillKey + ':' + q.hand)
  }
  const emptyPoolKeys = new Set()
  for (let i = 0; i < 500; i++) emptyPoolKeys.add(drawFresh('weakness', null, freshState()).drillKey)
  return { seen: [...seen].sort(), fallbackVariety: emptyPoolKeys.size }
})()`)
check(
  weaknessDraw.seen.length === 2 &&
    weaknessDraw.seen.includes('RFI_UTG:KTo') &&
    weaknessDraw.seen.includes('BTN_BB:76s'),
  '苦手モード: 間違えた (スポット, ハンド) のペアだけが出る',
  weaknessDraw.seen.join(' '),
)
check(weaknessDraw.fallbackVariety > 5, '苦手モード: 苦手が空なら普通の出題に落ちる', String(weaknessDraw.fallbackVariety))

// 古い保存 (byHand / fillBest なし) も読める
check(
  run(`(() => {
    localStorage.setItem('poker-range-trainer/v3', JSON.stringify({
      version: 3, byDrill: {}, byCategory: {}, streak: { current: 0, best: 0 },
      history: [], reviewQueue: [], soundOn: true, mode: 'rfi',
    }))
    const s = loadState()
    return typeof s.byHand === 'object' && typeof s.fillBest === 'object' && weakHands(s).length === 0
  })()`),
  'byHand / fillBest の無い古い保存を安全に読み直す',
)

// ---- レンジ穴埋めテスト ----

// 隠すのは境界線上のマスだけ (どの候補も、隣に答えの違うマスがある)
const fillCandidateCheck = run(`(() => {
  const bad = []
  for (const drill of DRILLS) {
    const at = (r, c) => ALL_HANDS[r * 13 + c]
    const candidates = new Set(fillCandidates(drill))
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        const hand = at(r, c)
        const neighbors = []
        if (r > 0) neighbors.push(at(r - 1, c))
        if (r < 12) neighbors.push(at(r + 1, c))
        if (c > 0) neighbors.push(at(r, c - 1))
        if (c < 12) neighbors.push(at(r, c + 1))
        const isBoundary = neighbors.some((n) => drill.answerFor(n) !== drill.answerFor(hand))
        if (isBoundary !== candidates.has(hand)) bad.push(drill.key + ':' + hand)
      }
    }
  }
  return bad
})()`)
check(fillCandidateCheck.length === 0, '穴埋め候補 = 境界線上のマス (全ドリルで一致)', fillCandidateCheck.slice(0, 3).join(','))

const fillPickCheck = run(`(() => {
  const results = []
  for (const drill of DRILLS) {
    const blanks = pickFillBlanks(drill)
    const candidates = new Set(fillCandidates(drill))
    results.push({
      key: drill.key,
      count: blanks.length,
      unique: new Set(blanks).size === blanks.length,
      allBoundary: blanks.every((h) => candidates.has(h)),
    })
  }
  return results
})()`)
check(
  fillPickCheck.every((r) => r.count === 12 && r.unique && r.allBoundary),
  '穴埋め: 全ドリルで 12 マス・重複なし・全部境界線上',
  JSON.stringify(fillPickCheck.filter((r) => !(r.count === 12 && r.unique && r.allBoundary)).slice(0, 2)),
)

// 採点と自己ベスト
const fillGradeCheck = run(`(() => {
  const drill = DRILL_BY_KEY['RFI_UTG']
  const blanks = pickFillBlanks(drill)
  const perfect = Object.fromEntries(blanks.map((h) => [h, drill.answerFor(h)]))
  const allRight = gradeFillGuesses(drill, blanks, perfect)
  const empty = gradeFillGuesses(drill, blanks, {})
  let s = freshState()
  s = recordFillResult(s, 'RFI_UTG', 75)
  s = recordFillResult(s, 'RFI_UTG', 50) // 下回っても上書きしない
  s = recordFillResult(s, 'RFI_UTG', 92)
  return { allRight, emptyPct: empty.pct, best: s.fillBest.RFI_UTG }
})()`)
check(fillGradeCheck.allRight.pct === 100 && fillGradeCheck.allRight.wrong.length === 0, '穴埋め: 全問正解で 100%')
check(fillGradeCheck.emptyPct === 0, '穴埋め: 未回答は全部間違い扱い')
check(fillGradeCheck.best === 92, '穴埋め: 自己ベストは上がるときだけ更新される', String(fillGradeCheck.best))

// UI: タップでアクションが循環し、採点まで通る
const fillUi = run(`(() => {
  startFill('RFI_UTG')
  const drill = DRILL_BY_KEY['RFI_UTG']
  const first = fill.blanks[0]

  tapFillCell(first)
  const afterOneTap = fill.guesses[first]
  tapFillCell(first)
  const afterTwoTaps = fill.guesses[first]

  // 全マスを正解に合わせて採点
  for (const hand of fill.blanks) {
    let guard = 0
    while (fill.guesses[hand] !== drill.answerFor(hand) && guard++ < 5) tapFillCell(hand)
  }
  gradeFill()

  const afterGradeTap = fill.guesses[first]
  tapFillCell(first) // 採点後はタップできない
  return {
    afterOneTap, afterTwoTaps,
    pct: fill.result.pct,
    best: state.fillBest.RFI_UTG,
    locked: fill.guesses[first] === afterGradeTap,
    gradeHidden: el.fillGrade.hidden,
    retryShown: !el.fillRetry.hidden,
    resultText: el.fillResult.textContent,
  }
})()`)
check(fillUi.afterOneTap === 'raise' && fillUi.afterTwoTaps === 'fold', '穴埋め UI: タップでアクションが循環する', `${fillUi.afterOneTap} → ${fillUi.afterTwoTaps}`)
check(fillUi.pct === 100 && fillUi.best === 100, '穴埋め UI: 全問正解で採点され自己ベストに入る', `${fillUi.pct}%`)
check(fillUi.locked, '穴埋め UI: 採点後はマスを変えられない')
check(fillUi.gradeHidden && fillUi.retryShown, '穴埋め UI: 採点後は「もう一度」に切り替わる')
check(fillUi.resultText.includes('100%'), '穴埋め UI: 結果の文章が出る', fillUi.resultText.slice(0, 40))

// ---- 定石ビューア: ミスの重ね書き ----

const missOverlay = run(`(() => {
  commit(recordAnswer(state, { drillKey: 'CO_BTN', hand: 'AJo', chosenAction: 'call', correctAction: 'threebet', isCorrect: false }))
  selectReference('CO_BTN')
  const before = el.refGrid.children.filter((c) => c.classList.contains('cell-missed')).length
  referenceShowMiss = true
  drawReference()
  const marked = el.refGrid.children.filter((c) => c.classList.contains('cell-missed'))
  const toggleText = el.refMissToggle.textContent
  referenceShowMiss = false
  drawReference()
  const after = el.refGrid.children.filter((c) => c.classList.contains('cell-missed')).length
  selectReference(DRILLS[0].key)
  return { before, marked: marked.map((c) => c.textContent), toggleText, after }
})()`)
check(missOverlay.before === 0, 'ミス重ね書き: OFF のときは赤枠が無い')
check(
  missOverlay.marked.includes('AJo') && missOverlay.toggleText.includes('ON'),
  'ミス重ね書き: ON にすると間違えた手に赤枠が付く',
  missOverlay.marked.join(','),
)
check(missOverlay.after === 0, 'ミス重ね書き: OFF に戻すと消える')

// 苦手リストが成績カードに出て、全部消えると隠れる
const weakListUi = run(`(() => {
  renderDashboard(state, selectFocus)
  const shown = !el.weakHandsBox.hidden
  const rows = el.weakHandList.children.map((r) => r.textContent)
  renderDashboard(freshState(), selectFocus)
  const hiddenWhenEmpty = el.weakHandsBox.hidden
  renderDashboard(state, selectFocus)
  return { shown, rows, hiddenWhenEmpty }
})()`)
check(weakListUi.shown && weakListUi.rows.some((r) => r.includes('AJo')), '苦手ハンドのリストが成績に出る', weakListUi.rows.join(' | '))
check(weakListUi.hiddenWhenEmpty, '苦手が無ければリストは出ない')

// 後片付け: 以降のチェックに苦手の記録を持ち越さない
run(`commit({ ...freshState(), mode: state.mode, soundOn: state.soundOn, easyMode: state.easyMode }); renderDashboard(state, selectFocus); advance()`)

// ---- BB の進め方 (早見表とFAQ) ----

const bbGuide = run(`(() => {
  openSheet('blinds')
  const collectText = (node) => {
    let text = node.textContent || ''
    for (const child of node.children || []) text += ' ' + collectText(child)
    return text
  }
  const text = collectText(el.sheetBody)
  closeSheet()
  return text
})()`)
check(bbGuide.includes('進め方') && bbGuide.includes('誰のレイズか'), '早見表: BB の進め方 (考える順番) が入っている')
check(run(`FAQ.some((e) => e.q.includes('BB のとき'))`), 'FAQ: BB の進め方の項目がある')
check(run(`FAQ.some((e) => e.q.includes('GTO'))`), 'FAQ: GTO ツールの項目がある')

// ---- 勝率表 (対ランダム勝率) ----
//
// tools/gen-equity.mjs が生成した静的データの検算。
// アンカー = 解析的に厳密値が知られているハンド。モンテカルロ 12 万回の誤差は ±0.4pt 程度なので
// 0.7pt ずれていたら生成コードのバグを疑う。

const EQUITY_ANCHORS = [
  ['AA', 85.2], ['KK', 82.4], ['QQ', 79.9], ['22', 50.3],
  ['AKs', 67.0], ['AKo', 65.3], ['72o', 34.6], ['32o', 32.3],
]
for (const [hand, expected] of EQUITY_ANCHORS) {
  const got = run(`EQUITY_VS_RANDOM['${hand}']`)
  check(Math.abs(got - expected) < 0.7, `勝率 ${hand} = ${got}%`, `(既知値 ${expected}%)`)
}

check(
  run(`UNIQUE_HANDS.every((h) => typeof EQUITY_VS_RANDOM[h] === 'number' && EQUITY_VS_RANDOM[h] > 25 && EQUITY_VS_RANDOM[h] < 90)`),
  '勝率表に 169 ハンド全部が妥当な範囲で入っている',
)
check(
  run(`Object.keys(EQUITY_VS_RANDOM).length`) === 169,
  '勝率表に余計なキーが無い',
  String(run(`Object.keys(EQUITY_VS_RANDOM).length`)),
)
check(
  run(`UNIQUE_HANDS.every((h) => h === 'AA' || EQUITY_VS_RANDOM[h] < EQUITY_VS_RANDOM['AA'])`),
  'AA が最強',
)

// 不変条件: 同じ2ランクなら スーテッド > オフスーツ (フラッシュの分だけ必ず上)
const suitedWorse = run(`UNIQUE_HANDS
  .filter((h) => h.endsWith('s'))
  .filter((h) => EQUITY_VS_RANDOM[h] <= EQUITY_VS_RANDOM[h.slice(0, 2) + 'o'])`)
check(suitedWorse.length === 0, '勝率: 同じランクではスーテッドが必ず上', suitedWorse.join(','))

// 不変条件: ペアは高いほど強い
const pairOrder = run(`(() => {
  const pairs = RANKS.map((r) => r + r)
  return pairs.every((p, i) => i === 0 || EQUITY_VS_RANDOM[p] < EQUITY_VS_RANDOM[pairs[i - 1]])
})()`)
check(pairOrder, '勝率: ペアは高いほど強い')

// 勝率カードで言い切っている実例 (K7o は勝率が上なのに捨てられ、76s は下なのに開ける)
check(
  run(`EQUITY_VS_RANDOM['K7o'] > EQUITY_VS_RANDOM['76s']`),
  '実例: K7o の勝率 > 76s の勝率',
  `${run(`EQUITY_VS_RANDOM['K7o']`)}% vs ${run(`EQUITY_VS_RANDOM['76s']`)}%`,
)
check(
  run(`RFI_DRILLS.every((d) => !d.sets.raise.has('K7o')) && DRILL_BY_KEY['RFI_UTG'].sets.raise.has('76s')`),
  '実例: K7o は全席フォールドで 76s は UTG から開ける',
)

// index.html に書いた数字が生成データと一致している (ずれたら書き直しに気づける)
const htmlSource = readFileSync(join(ROOT, 'index.html'), 'utf8')
check(
  htmlSource.includes(`<td>K7o</td><td>${run(`EQUITY_VS_RANDOM['K7o']`).toFixed(1)}%</td>`),
  '解説の K7o の勝率が生成データと一致',
)
check(
  htmlSource.includes(`<td>76s</td><td>${run(`EQUITY_VS_RANDOM['76s']`).toFixed(1)}%</td>`),
  '解説の 76s の勝率が生成データと一致',
)

// ---- よくあるミスと合言葉 ----

check(run('MISTAKES.length') >= 10, 'よくあるミスが十分な数ある', `${run('MISTAKES.length')} 件`)
check(
  run(`MISTAKES.every((m) => m.title && m.why && m.fix && m.why.length > 40 && m.fix.length > 20)`),
  '全ミスに なぜまずい / どうする が入っている',
)
check(run('MANTRAS.length') >= 6, '合言葉が十分な数ある', `${run('MANTRAS.length')} 件`)

// 合言葉の事実の主張を検算
check(
  run(`UNIQUE_HANDS.filter(isPair).every((h) => RFI_DRILLS.every((d) => d.sets.raise.has(h)))`),
  '合言葉「ペアは全席レイズ」が実データで成り立つ',
)
check(
  run(`MANTRAS.some((m) => m.note.includes('7.5bb') && m.note.includes('10bb')) && THREEBET_SIZE.ip === '7.5bb' && THREEBET_SIZE.oop === '10bb'`),
  '合言葉のサイズが THREEBET_SIZE と一致',
)

// ミス集の「UTG では 84%」を foldBaseline から検算
check(
  Math.abs(run(`DRILL_BY_KEY['RFI_UTG'].foldBaseline`) - 84) < 1,
  'ミス集の「UTG では 84%」が foldBaseline と一致',
  `${run(`DRILL_BY_KEY['RFI_UTG'].foldBaseline`).toFixed(1)}%`,
)

// ---- やさしい説明 (初心者版) ----
//
// くわしい版と同じ場面すべてに、やさしい版が存在し、答えを変えていないこと。
// 「やさしくするために説明を変えたら、実は答えも変わっていた」が最悪の事故。

const easyGaps = run(`(() => {
  const bad = []
  for (const drill of ALL_DRILLS) {
    const hands = drill.type === 'sizing' ? [null] : UNIQUE_HANDS
    for (const hand of hands) {
      try {
        const easy = coachFor(drill, hand, true)
        const detail = coachFor(drill, hand, false)
        if (!easy.why || !easy.tip) bad.push('empty:' + drill.key + ':' + hand)
        // やさしい版がくわしい版のコピーになっていない (言い換える意味がある)
        if (easy.why === detail.why) bad.push('same:' + drill.key + ':' + hand)
      } catch (e) {
        bad.push('throw:' + drill.key + ':' + hand + ':' + e.message)
      }
    }
  }
  return bad
})()`)
check(easyGaps.length === 0, 'やさしい版が全ドリル × 全ハンドで存在し、くわしい版と別の文章になっている', easyGaps.slice(0, 3).join(' | '))

// 専門用語を素で出していないこと (出すなら必ずその場で言い換える約束)
const JARGON = ['ポラライズド', 'ドミネート', 'ブロッカー', 'エクイティ', 'ポットオッズ', 'IP', 'OOP', 'combos', 'GTO']
const easyJargon = run(`(() => {
  const found = {}
  for (const drill of ALL_DRILLS) {
    const hands = drill.type === 'sizing' ? [null] : UNIQUE_HANDS
    for (const hand of hands) {
      const { why, tip } = coachFor(drill, hand, true)
      const text = why + ' ' + tip
      for (const word of ${JSON.stringify(JARGON)}) {
        if (text.includes(word)) (found[word] = found[word] || []).push(drill.key + ':' + hand)
      }
    }
  }
  return Object.entries(found).map(([w, hits]) => w + ' (' + hits.length + '件 例:' + hits[0] + ')')
})()`)
check(easyJargon.length === 0, 'やさしい版が専門用語を素で出さない', easyJargon.join(', '))

// やさしい版でも「答え」は同じ。説明が変わるだけで、結論が変わってはいけない
check(
  run(`(() => {
    // coachFor は説明しか返さないので、answerFor が唯一の正解であることを確認する。
    // どちらのレベルでも同じ drill.answerFor を説明している = 説明中に出る結論語が答えと矛盾しない
    const bad = []
    for (const key of ['CO_BTN', 'UTG_BB', 'RFI_UTG']) {
      const drill = DRILL_BY_KEY[key]
      for (const hand of UNIQUE_HANDS) {
        const answer = drill.answerFor(hand)
        const easy = coachFor(drill, hand, true).why
        // 降りるのが正解なのに「被せる」と書いている、のような矛盾を弾く
        if (answer === 'fold' && (easy.includes('上から被せて相手が降りれば勝ち') || easy.includes('大きなポットを作りにいきます'))) {
          bad.push(key + ':' + hand)
        }
      }
    }
    return bad
  })()`).length === 0,
  'やさしい版の説明が、正解と矛盾する言い方をしない',
)

// つまずきどころ (AQo / AJo の逆転) が、やさしい版でもちゃんと説明されている
const easyAjo = run(`coachFor(DRILL_BY_KEY['CO_BTN'], 'AJo', true).why`)
check(easyAjo.includes('AQo') && easyAjo.includes('キッカー負け'), 'やさしい版: AJo の逆転を専門用語なしで説明する', easyAjo.slice(0, 50))
const easyAqo = run(`coachFor(DRILL_BY_KEY['CO_BTN'], 'AQo', true).why`)
check(easyAqo.includes('AJo') && easyAqo.includes('もったいない'), 'やさしい版: AQo のコールを専門用語なしで説明する', easyAqo.slice(0, 50))

// やさしい版のモードヒントが全モードにある
check(
  run(`MODES.every((m) => m.easyHint && m.easyHint.length > 20 && m.easyHint !== m.hint)`),
  '全モードに やさしい版のヒントがある',
)

// ---- ポラライズ (3ベットは強さの順ではない) ----
//
// AQo コール / AJo 3ベット の逆転は全 BTN スポットで起きる本物の構造。
// コーチがこれを「バリューだから 3ベット」と説明すると真逆を教えることになるので、
// 逆転の検出と説明をここで固定する。

const polarizedSpots = run(`['UTG_BTN', 'HJ_BTN', 'CO_BTN'].map((key) => {
  const d = DRILL_BY_KEY[key]
  return [key, d.answerFor('AKo'), d.answerFor('AQo'), d.answerFor('AJo')]
})`)
for (const [key, ako, aqo, ajo] of polarizedSpots) {
  check(
    ako === 'threebet' && aqo === 'call' && ajo === 'threebet',
    `${key}: AKo 3bet / AQo コール / AJo 3bet の逆転がある`,
    `${ako} / ${aqo} / ${ajo}`,
  )
}

// BTN のコールレンジに入るオフスーツは AQo だけ (解説で言い切っている事実)
const btnFlatOffsuit = run(`['UTG_BTN', 'HJ_BTN', 'CO_BTN'].map((key) =>
  [key, [...DRILL_BY_KEY[key].sets.call].filter((h) => h.endsWith('o'))]
)`)
for (const [key, offsuits] of btnFlatOffsuit) {
  check(
    offsuits.length === 1 && offsuits[0] === 'AQo',
    `${key}: BTN のフラットレンジのオフスーツは AQo だけ`,
    offsuits.join(','),
  )
}

// 逆転の検出そのもの
check(run(`calledAbove(DRILL_BY_KEY['CO_BTN'], 'AJo') === 'AQo'`), '逆転検出: AJo の上に コールの AQo がいる')
check(run(`threebetBelow(DRILL_BY_KEY['CO_BTN'], 'AQo') === 'AJo'`), '逆転検出: AQo の下に 3ベットの AJo がいる')
check(run(`calledAbove(DRILL_BY_KEY['CO_BTN'], 'AKo') === null`), '逆転検出: AKo の上にコールはいない (純粋なバリュー)')
check(run(`calledAbove(DRILL_BY_KEY['CO_BTN'], 'A8s') === 'A9s'`), '逆転検出: スーテッドにも同じ逆転がある (A9s コール / A8s 3bet)')

// コーチが逆転を「バリューだから」と説明していないこと (これが一番まずい誤答)
const ajoWhy = run(`coachFor(DRILL_BY_KEY['CO_BTN'], 'AJo').why`)
check(
  !ajoWhy.includes('バリュー寄りの 3ベット'),
  'コーチ: AJo の 3ベットを「バリュー寄り」と説明しない (真逆を教えてしまう)',
  ajoWhy.slice(0, 40),
)
check(ajoWhy.includes('AQo') && ajoWhy.includes('ブロック'), 'コーチ: AJo は AQo との逆転とブロッカーで説明する', ajoWhy.slice(0, 60))

const aqoWhy = run(`coachFor(DRILL_BY_KEY['CO_BTN'], 'AQo').why`)
check(
  !aqoWhy.includes('3ベットするほど強くない'),
  'コーチ: AQo のコールを「3ベットするほど強くない」と説明しない (嘘になる)',
  aqoWhy.slice(0, 40),
)
check(aqoWhy.includes('AJo') && aqoWhy.includes('4ベット'), 'コーチ: AQo は 4ベットされる不利と AJo との役割分担で説明する', aqoWhy.slice(0, 60))

// バリューの説明は残っている (何でもかんでも逆転扱いにしていない)
check(
  run(`coachFor(DRILL_BY_KEY['CO_BTN'], 'AKo').why`).includes('バリュー'),
  'コーチ: 本物のバリュー (AKo) はバリューと説明する',
)

// 全ドリル × 全ハンドで、逆転検出が例外を出さない
check(
  run(`(() => {
    for (const drill of VS_RFI_DRILLS) {
      for (const hand of UNIQUE_HANDS) {
        calledAbove(drill, hand)
        threebetBelow(drill, hand)
      }
    }
    return true
  })()`),
  '逆転検出が全ドリル × 全ハンドで落ちない',
)

// ---- よくある質問 ----

check(run('FAQ.length') >= 10, 'よくある質問が十分な数ある', `${run('FAQ.length')} 件`)
check(
  run(`FAQ.every((e) => e.q && e.a && e.a.length > 80)`),
  '全質問に (使いものになる長さの) 答えがある',
)
check(
  run(`FAQ.some((e) => e.q.includes('AQo') && e.q.includes('AJo'))`),
  'よくある質問に AQo / AJo の逆転が入っている',
)
check(run(`searchFaq('').length`) === run('FAQ.length'), '検索が空なら全件返す')
check(run(`searchFaq('ポラライズド').length`) > 0, '答えの中身でも検索できる')
check(run(`searchFaq('ぽよよん').length`) === 0, '当たらない検索は空を返す')

// ---- 用語解説 ----

check(run('GLOSSARY_TERM_COUNT') > 25, '用語が十分な数ある', `${run('GLOSSARY_TERM_COUNT')} 語`)
check(
  run(`GLOSSARY.every((g) => g.section && g.terms.every((t) => t.term && t.def && t.def.length > 30))`),
  '全用語に見出しと (使いものになる長さの) 定義がある',
)
check(run(`searchGlossary('').reduce((n, g) => n + g.terms.length, 0)`) === run('GLOSSARY_TERM_COUNT'), '検索が空なら全件返す')
check(
  run(`searchGlossary('ドミネート').reduce((n, g) => n + g.terms.length, 0)`) > 0,
  '用語名で検索できる',
)
check(
  run(`searchGlossary('ブロック').reduce((n, g) => n + g.terms.length, 0)`) > 0,
  '説明文の中身でも検索できる',
)
check(run(`searchGlossary('ぽよよん').length`) === 0, '当たらない検索は空を返す')

// 画面に出てくる言葉が用語集に載っているか (「見出しだけ知っていて中身を知らない」を作らない)
const glossaryText = run(`JSON.stringify(GLOSSARY)`)
for (const term of ['RFI', '3ベット', 'IP', 'OOP', 'combos', 'ドミネート', 'ブロッカー', 'ホイール', '境界ハンド', 'エクイティ', 'ポットオッズ', '混合戦略']) {
  check(glossaryText.includes(term), `用語集に「${term}」がある`)
}

// ---- 毎日の特訓メニュー ----

const dailyFresh = run(`dailyTasks(freshState())`)
check(dailyFresh.length === 4, '今日のメニューは 4 タスク', String(dailyFresh.length))
check(
  dailyFresh.every((t) => t.target > 0 && t.done === 0 && t.isComplete === false),
  '始めたばかりなら進捗ゼロ・未完了',
)
check(
  dailyFresh.map((t) => t.id).join(',') === 'boundary,spot,weak,sizing',
  'メニューの並びは 境界 → 今日のスポット → 弱点 → サイズ',
  dailyFresh.map((t) => t.id).join(','),
)

// タスクの mode / focus が実際にそのモードで出題できる組み合わせになっている
const dailyRoutable = run(`dailyTasks(freshState()).every((t) => {
  const mode = MODE_BY_ID[t.mode]
  if (!mode) return false
  if (!t.focus) return true
  return mode.drills().some((d) => d.key === t.focus)
})`)
check(dailyRoutable, 'メニューの各タスクが、その mode で出題できる focus を指している')

// 「今日のスポット」と「弱点」が同じスポットにならない
check(
  run(`(() => {
    const tasks = dailyTasks(freshState())
    return tasks[1].focus !== tasks[2].focus
  })()`),
  '「今日のスポット」と「弱点」が重複しない',
)

// 進捗は普通に練習しているだけで埋まる (タスクを開始しなくても数える)
const dailyProgress = run(`(() => {
  let s = { ...freshState(), mode: 'boundary' }
  for (let i = 0; i < 5; i++) {
    s = recordAnswer(s, { drillKey: 'RFI_UTG', hand: 'AA', chosenAction: 'raise', correctAction: 'raise', isCorrect: true })
  }
  const boundary = dailyTasks(s).find((t) => t.id === 'boundary')
  return { done: boundary.done, target: boundary.target, complete: boundary.isComplete }
})()`)
check(dailyProgress.done === 5, '境界モードで解くとメニューの進捗が進む', `${dailyProgress.done}/${dailyProgress.target}`)
check(dailyProgress.complete === false, '目標に届くまでは未完了')

// サイズモードの進捗はサイズのタスクだけを進める
const dailySizing = run(`(() => {
  let s = { ...freshState(), mode: 'sizing' }
  for (let i = 0; i < 10; i++) {
    s = recordAnswer(s, { drillKey: 'SIZE_RFI_UTG', hand: null, chosenAction: '2.5bb', correctAction: '2.5bb', isCorrect: true })
  }
  const tasks = dailyTasks(s)
  return {
    sizing: tasks.find((t) => t.id === 'sizing'),
    boundary: tasks.find((t) => t.id === 'boundary').done,
  }
})()`)
check(dailySizing.sizing.isComplete, 'サイズを 10 問解くとサイズのタスクが完了する', `${dailySizing.sizing.done}/${dailySizing.sizing.target}`)
check(dailySizing.boundary === 0, 'サイズの進捗が境界のタスクに漏れない')

// 全タスクを埋めると完走 → 連続日数が 1 になる
const dailyDone = run(`(() => {
  let s = freshState()
  const fill = (task) => {
    const drillKey = task.focus || (task.id === 'sizing' ? 'SIZE_RFI_UTG' : 'RFI_UTG')
    const drill = DRILL_BY_KEY[drillKey]
    const hand = drill.type === 'sizing' ? null : 'AA'
    const correct = drill.answerFor(hand)
    s = { ...s, mode: task.mode }
    for (let i = 0; i < task.target; i++) {
      s = recordAnswer(s, { drillKey, hand, chosenAction: correct, correctAction: correct, isCorrect: true })
    }
  }
  for (const task of dailyTasks(s)) fill(task)

  const before = isDailyComplete(s)
  s = bumpDailyStreak(s)
  const afterFirst = s.dailyStreak.days
  s = bumpDailyStreak(s) // 同じ日に何度呼んでも増えない
  return { before, afterFirst, afterSecond: s.dailyStreak.days, date: s.dailyStreak.date }
})()`)
check(dailyDone.before === true, '4タスクすべて目標に届くとメニュー完走と判定される')
check(dailyDone.afterFirst === 1, '完走すると連続日数が 1 になる', String(dailyDone.afterFirst))
check(dailyDone.afterSecond === 1, '同じ日に何度完走しても連続日数は増えない', String(dailyDone.afterSecond))
check(dailyDone.date === run('todayKey()'), '完走日が今日として記録される')

// 昨日完走していれば連続日数が伸び、間が空けば 1 に戻る
const streakChain = run(`(() => {
  const base = { ...freshState(), dailyStreak: { date: yesterdayKey(), days: 4 } }
  const gapped = { ...freshState(), dailyStreak: { date: '2020-01-01', days: 9 } }
  // isDailyComplete を通すために、完走済みのログを直接与える
  const complete = (s) => {
    let next = s
    for (const task of dailyTasks(s)) {
      const drillKey = task.focus || (task.id === 'sizing' ? 'SIZE_RFI_UTG' : 'RFI_UTG')
      const drill = DRILL_BY_KEY[drillKey]
      const hand = drill.type === 'sizing' ? null : 'AA'
      const correct = drill.answerFor(hand)
      next = { ...next, mode: task.mode }
      for (let i = 0; i < task.target; i++) {
        next = recordAnswer(next, { drillKey, hand, chosenAction: correct, correctAction: correct, isCorrect: true })
      }
    }
    return next
  }
  return {
    continued: bumpDailyStreak(complete(base)).dailyStreak.days,
    reset: bumpDailyStreak(complete(gapped)).dailyStreak.days,
  }
})()`)
check(streakChain.continued === 5, '昨日完走していれば連続日数が伸びる', String(streakChain.continued))
check(streakChain.reset === 1, '日が空いていれば連続日数は 1 に戻る', String(streakChain.reset))

// 日付が変われば今日のログは無視される (メニューが自動でリセットされる)
check(
  run(`(() => {
    const stale = { ...freshState(), daily: { date: '2020-01-01', log: [{ drillKey: 'RFI_UTG', mode: 'boundary' }] } }
    return dailyLog(stale).length === 0 && dailyTasks(stale).every((t) => t.done === 0)
  })()`),
  '昨日のログは今日の進捗に数えない (日付でリセット)',
)

// メニューは日付で決まる = 同じ日なら何度呼んでも同じ課題
check(
  run(`(() => {
    const s = freshState()
    return JSON.stringify(dailyTasks(s).map((t) => [t.id, t.focus])) ===
           JSON.stringify(dailyTasks(s).map((t) => [t.id, t.focus]))
  })()`),
  'メニューは同じ日なら何度開いても同じ',
)

// 弱点が出ていればそれを拾う
const dailyWeak = run(`(() => {
  let s = freshState()
  const spot = dailyTasks(s)[1].focus         // 今日のスポット (弱点タスクから除外される)
  const target = DRILLS.find((d) => d.key !== spot && d.type === 'rfi')
  const drill = DRILL_BY_KEY[target.key]
  const correct = drill.answerFor('AA')
  const wrong = drill.actions.map((a) => a.id).find((a) => a !== correct)
  for (let i = 0; i < 8; i++) {
    s = recordAnswer(s, { drillKey: target.key, hand: 'AA', chosenAction: wrong, correctAction: correct, isCorrect: false })
  }
  const weak = dailyTasks(s).find((t) => t.id === 'weak')
  return { picked: weak.focus, expected: target.key, label: weak.label }
})()`)
check(
  dailyWeak.picked === dailyWeak.expected,
  '正解率が落ちているスポットが「弱点」タスクに選ばれる',
  `${dailyWeak.picked} (期待 ${dailyWeak.expected})`,
)
check(dailyWeak.label.includes('弱点'), '本物の弱点なら「弱点」と表示する', dailyWeak.label)

// ---- 解説で教えている構造が実データで成り立つ ----
// (index.html の「3ベット側の覚え方」に書いた主張。データを変えたらここが落ちて文言の見直しに気づける)

const callHeroes = run(`[...new Set(VS_RFI_DRILLS.filter((d) => d.sets.call.size > 0).map((d) => d.hero))]`)
check(
  callHeroes.every((h) => h === 'BTN' || h === 'BB'),
  '解説: コールレンジが存在するのは BTN と BB だけ',
  callHeroes.join(','),
)

const noWheelAce = run(`VS_RFI_DRILLS.filter(
  (d) => !['A5s', 'A4s', 'A3s', 'A2s'].some((h) => d.sets.threebet.has(h))
).map((d) => d.key)`)
check(noWheelAce.length === 0, '解説: 全 3ベットレンジにホイールエース (A5s-A2s) が入っている', noWheelAce.join(','))

// ---- 定石ビューア ----

// main.js の初期化で最初のスポットが描かれている
check(run(`el.refGrid.children.length`) === 169, '定石ビューア: グリッドが 169 マス描かれる')
check(run(`el.refRfi.children.length`) === 5, '定石ビューア: RFI のボタンが 5 個')
check(run(`el.refVs.children.length`) === 14, '定石ビューア: vs RFI のボタンが 14 個')
check(run(`el.refTitle.textContent.length > 0 && el.refNote.textContent.length > 0`), '定石ビューア: タイトルと説明が入る')

// スポットを切り替えると中身が追随する
const refSwitch = run(`(() => {
  selectReference('BTN_BB')
  const stats = el.refStats.textContent
  const legend = el.refLegend.children.length
  const active = [...el.refRfi.children, ...el.refVs.children].filter((b) => b.className.includes('active'))
  const raiseCells = el.refGrid.children.filter((c) => c.className.includes('act-threebet')).length
  selectReference('UTG_SB')
  const sbStats = el.refStats.textContent
  const sbLegend = el.refLegend.children.length
  return { stats, legend, active: active.map((b) => b.textContent), raiseCells, sbStats, sbLegend }
})()`)
check(refSwitch.stats.includes('コール') && refSwitch.stats.includes('3ベット'), '定石ビューア: BTN_BB は 3ベットとコールの割合を出す', refSwitch.stats)
check(refSwitch.legend === 3, '定石ビューア: BTN_BB の凡例は 3 アクション')
check(
  refSwitch.active.length === 1 && refSwitch.active[0].includes('BB'),
  '定石ビューア: 選択中のボタンだけが active',
  refSwitch.active.join(','),
)
check(refSwitch.raiseCells > 0, '定石ビューア: 3ベットのマスが塗られている', String(refSwitch.raiseCells))
check(refSwitch.sbStats.includes('コールなし'), '定石ビューア: SB のスポットは「コールなし」と明記する', refSwitch.sbStats)
check(refSwitch.sbLegend === 2, '定石ビューア: コールなしのスポットの凡例は 2 アクション')

// マスをタップすると「この手はなぜ？」が出る (= 質問窓の代わり)
const refPick = run(`(() => {
  selectReference('CO_BTN')
  const before = { answerHidden: el.refAnswer.hidden, promptHidden: el.refPrompt.hidden }

  // グリッドのマスは 169 個、全部タップできる
  const pickable = el.refGrid.children.filter((c) => c.classList.contains('pickable')).length

  pickReferenceHand('AJo')
  const picked = {
    answerHidden: el.refAnswer.hidden,
    promptHidden: el.refPrompt.hidden,
    head: el.refAnswerHead.textContent,
    why: el.refAnswerWhy.textContent,
    tip: el.refAnswerTip.textContent,
    cls: el.refAnswer.className,
  }

  pickReferenceHand('AJo') // もう一度押すと解除 (トグル)
  const cleared = el.refAnswer.hidden

  pickReferenceHand('AQo')
  const second = { head: el.refAnswerHead.textContent, cls: el.refAnswer.className }

  // スポットを切り替えるとタップは解除される (別スポットの答えが残ると混乱する)
  selectReference('UTG_BB')
  const afterSwitch = el.refAnswer.hidden

  return { before, pickable, picked, cleared, second, afterSwitch }
})()`)

check(refPick.before.answerHidden === true && refPick.before.promptHidden === false, '定石ビューア: 最初は「タップして」の案内だけ')
check(refPick.pickable === 169, '定石ビューア: 169 マス全部がタップできる', String(refPick.pickable))
check(
  refPick.picked.answerHidden === false && refPick.picked.head.includes('AJo') && refPick.picked.head.includes('3ベット'),
  '定石ビューア: マスをタップすると答えが出る',
  refPick.picked.head,
)
check(
  refPick.picked.why.includes('AQo') && refPick.picked.tip.length > 0,
  '定石ビューア: タップした手の「なぜ」と「覚え方」が出る',
  refPick.picked.why.slice(0, 40),
)
check(refPick.picked.cls.includes('act-threebet-tint'), '定石ビューア: 答えの色がアクションと揃う', refPick.picked.cls)
check(refPick.cleared === true, '定石ビューア: 同じマスをもう一度押すと閉じる (トグル)')
check(
  refPick.second.head.includes('AQo') && refPick.second.cls.includes('act-call-tint'),
  '定石ビューア: 別のマスを押すと答えが差し替わる',
  refPick.second.head,
)
check(refPick.afterSwitch === true, '定石ビューア: スポットを変えるとタップが解除される')

// 全 19 スポット × 169 ハンドでタップしても落ちない (質問窓として全部に答えられる)
check(
  run(`(() => {
    for (const drill of DRILLS) {
      selectReference(drill.key)
      for (const hand of ALL_HANDS) {
        pickReferenceHand(hand)
        if (el.refAnswer.hidden || !el.refAnswerWhy.textContent || !el.refAnswerTip.textContent) return false
        pickReferenceHand(hand) // 解除して次へ
      }
    }
    return true
  })()`),
  '定石ビューア: 19 スポット × 169 ハンドのどこを押しても答えが出る',
)

// 検証内で切り替えた選択を初期状態へ戻す
run(`selectReference(DRILLS[0].key)`)

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
    coachHidden: el.coach.hidden,
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
    coachHidden: el.coach.hidden,
    coachWhy: el.coachWhy.textContent,
    coachTip: el.coachTip.textContent,
  }

  return { okBanner, ngBanner }
})()`)

check(uiFlow.okBanner.hidden === false, '回答すると判定エリアが表示される')

// テーブル図には常にポットが出る (全モード共通。bb を額として掴むための基準)
const potOnFelt = run(`(() => {
  const seen = []
  for (const key of ['RFI_UTG', 'UTG_BB', 'SIZE_CO_BTN']) {
    renderTable(DRILL_BY_KEY[key])
    const pot = el.table.children.find((c) => c.attributes.class === 'felt-pot')
    seen.push([key, pot ? pot.textContent : null])
  }
  return seen
})()`)
check(
  potOnFelt.every(([, text]) => text && text.startsWith('ポット ')),
  'テーブル図にポットが常に出る',
  JSON.stringify(potOnFelt),
)
check(
  potOnFelt[0][1] === 'ポット 1.5bb' && potOnFelt[1][1] === 'ポット 4bb' && potOnFelt[2][1] === 'ポット 4bb',
  'テーブル図のポットが正しい (RFI 1.5bb / vs RFI 4bb)',
  JSON.stringify(potOnFelt),
)

// サイズの選択肢に「実際に出す額」が添えてある
const sizeSubLabels = run(`(() => {
  renderActions(DRILL_BY_KEY['SIZE_UTG_BB'], () => {})
  return el.actions.children.map((b) => {
    const sub = b.children.find((c) => c.className === 'action-sub')
    return [b.dataset.action, sub ? sub.textContent : null]
  })
})()`)
check(
  sizeSubLabels.every(([, sub]) => sub && sub.startsWith('追加 ')),
  'サイズの選択肢すべてに「追加 ◯bb」が付く',
  JSON.stringify(sizeSubLabels),
)
check(
  sizeSubLabels.find(([id]) => id === '10bb')[1] === '追加 9bb',
  'BB が 10bb にするとき「追加 9bb」と出る (1bb はすでに払い込み済み)',
  JSON.stringify(sizeSubLabels),
)

// レンジのドリルには「追加」は付かない
check(
  run(`(() => {
    renderActions(DRILL_BY_KEY['RFI_UTG'], () => {})
    return el.actions.children.every((b) => !b.children.some((c) => c.className === 'action-sub'))
  })()`),
  'レンジの選択肢には「追加 ◯bb」を付けない',
)
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

// コーチは間違えた時だけ出る
check(uiFlow.okBanner.coachHidden === true, '正解時: コーチ (なぜ/覚え方) は出ない')
check(uiFlow.ngBanner.coachHidden === false, '不正解時: コーチが表示される')
check(
  uiFlow.ngBanner.coachWhy.length > 0 && uiFlow.ngBanner.coachTip.length > 0,
  '不正解時: なぜ と 覚え方 の両方に中身がある',
  `why=${uiFlow.ngBanner.coachWhy.slice(0, 30)}… tip=${uiFlow.ngBanner.coachTip.slice(0, 30)}…`,
)

// ---- UI: サイズの出題を実際に通す ----

const sizingUi = run(`(() => {
  selectMode('sizing')
  const drill = DRILL_BY_KEY[current.drillKey]

  const asked = {
    isSizing: drill.type === 'sizing',
    hand: current.hand,
    cardsHidden: el.cards.hidden,
    handText: el.hand.textContent,
    combos: el.combos.textContent,
    buttons: el.actions.children.map((b) => b.dataset.action),
  }

  const wrong = drill.actions.map((a) => a.id).find((a) => a !== drill.answer)
  answer(wrong)

  const verdict = {
    chartHidden: el.chart.hidden,
    banner: el.bannerText.textContent,
    note: el.verdictNote.textContent,
    coachHidden: el.coach.hidden,
    coachWhy: el.coachWhy.textContent,
    marks: el.actions.children.map((b) => [b.dataset.action, [...b.classList._set].filter((c) => c.startsWith('is-'))]),
    correct: drill.answer,
    chosen: wrong,
  }

  advance()
  const nextIsSizing = DRILL_BY_KEY[current.drillKey].type === 'sizing'

  // レンジのモードに戻すと、カードとレンジ表が戻る
  selectMode('rfi')
  const backToRange = {
    cardsHidden: el.cards.hidden,
    hand: current.hand,
  }
  const rangeDrill = DRILL_BY_KEY[current.drillKey]
  answer(rangeDrill.answerFor(current.hand))
  const rangeChartHidden = el.chart.hidden
  advance()

  return { asked, verdict, nextIsSizing, backToRange, rangeChartHidden }
})()`)

check(sizingUi.asked.isSizing, 'サイズモードに切り替えるとサイズの出題になる')
check(sizingUi.asked.hand === null, 'サイズの出題にハンドが無い')
check(sizingUi.asked.cardsHidden === true, 'サイズの出題ではカードを表示しない')
check(
  sizingUi.asked.combos.includes('手に依存しない'),
  'サイズの出題は「額は手に依存しない」と明記する',
  sizingUi.asked.combos,
)
check(
  sizingUi.asked.buttons.length === 4 && sizingUi.asked.buttons.every((b) => b.endsWith('bb')),
  'サイズの選択肢が bb 額の4択になっている',
  sizingUi.asked.buttons.join(','),
)
check(sizingUi.verdict.chartHidden === true, 'サイズの判定ではレンジ表を出さない (ハンドの表なので意味がない)')
check(
  sizingUi.asked.combos.includes(`持ち金 100bb`) && sizingUi.asked.combos.includes('ポット'),
  'サイズの出題に 持ち金 と ポット が出る (bb を額として掴めるように)',
  sizingUi.asked.combos,
)
check(
  sizingUi.verdict.banner.includes(sizingUi.verdict.correct),
  'サイズの不正解バナーが正しい額を出す',
  sizingUi.verdict.banner,
)
check(
  sizingUi.verdict.coachHidden === false && sizingUi.verdict.coachWhy.length > 0,
  'サイズを間違えるとコーチが出る',
  sizingUi.verdict.coachWhy.slice(0, 40),
)
const sizeCorrectMark = sizingUi.verdict.marks.find(([id]) => id === sizingUi.verdict.correct)
const sizeWrongMark = sizingUi.verdict.marks.find(([id]) => id === sizingUi.verdict.chosen)
check(
  sizeCorrectMark && sizeCorrectMark[1].includes('is-correct') && sizeWrongMark && sizeWrongMark[1].includes('is-wrong'),
  'サイズでも正解ボタンが緑・押した不正解が赤になる',
  JSON.stringify(sizingUi.verdict.marks),
)
// 判定文が「その数字が実際に何なのか」まで書いている
check(
  sizingUi.verdict.note.includes('ポット') &&
    sizingUi.verdict.note.includes('持ち金') &&
    sizingUi.verdict.note.includes('%'),
  'サイズの判定文が ポット / 持ち金 / 割合 まで書く',
  sizingUi.verdict.note,
)

check(sizingUi.nextIsSizing, 'サイズモードでは次の問題もサイズ')
check(sizingUi.backToRange.cardsHidden === false, 'レンジのモードに戻すとカードが復活する')
check(sizingUi.backToRange.hand !== null, 'レンジのモードに戻すとハンドが配られる')
check(sizingUi.rangeChartHidden === false, 'レンジのモードではレンジ表が戻る')

// ---- UI: 毎日の特訓メニュー / 用語解説 ----

check(run('el.dailyList.children.length') === 4, 'メニューが 4 行描かれる')
check(
  run(`el.dailyList.children.every((row) => row.children.length === 3)`),
  'メニューの各行が マーク / 本体 / 進捗 の3つを持つ',
)
check(run('el.dailyDone.hidden') === true, '未完走ならメニュー完了の表示は出ない')

// メニューの行をタップすると、そのモード / 狙い撃ちに切り替わって出題が始まる
const dailyStart = run(`(() => {
  const task = dailyTasks(state).find((t) => t.id === 'spot')
  startDailyTask(task)
  return { mode: state.mode, focus: state.focus, drawn: current.drillKey, want: task.focus }
})()`)
check(
  dailyStart.focus === dailyStart.want && dailyStart.drawn === dailyStart.want,
  'メニューの「今日のスポット」をタップするとそのスポットが出る',
  `${dailyStart.drawn} (期待 ${dailyStart.want})`,
)

const sizingStart = run(`(() => {
  const task = dailyTasks(state).find((t) => t.id === 'sizing')
  startDailyTask(task)
  return { mode: state.mode, isSizing: DRILL_BY_KEY[current.drillKey].type === 'sizing', hand: current.hand }
})()`)
check(
  sizingStart.mode === 'sizing' && sizingStart.isSizing && sizingStart.hand === null,
  'メニューの「サイズ」をタップするとサイズモードが始まる',
  JSON.stringify(sizingStart),
)

// 「やさしく」トグルが、表示中の解説をその場で書き換える
const easyToggle = run(`(() => {
  commit({ ...state, easyMode: false, mode: 'rfi', focus: null })
  advance()

  // わざと間違えてコーチを出す
  const drill = DRILL_BY_KEY[current.drillKey]
  const correct = drill.answerFor(current.hand)
  const wrong = drill.actions.map((a) => a.id).find((a) => a !== correct)
  answer(wrong)

  const detailText = el.coachWhy.textContent
  const detailHint = el.modeHint.textContent
  const detailLabel = el.easy.textContent

  // 定石ビューアにも答えを出しておく
  selectReference('CO_BTN')
  pickReferenceHand('AJo')
  const detailRef = el.refAnswerWhy.textContent

  // トグル (ボタンのハンドラは vm では発火しないので、同じ配線を直接呼ぶ)
  commit({ ...state, easyMode: true })
  renderEasy(state)
  renderModes(state, selectMode)
  drawReference()
  renderVerdict(state, current, gradeAnswer(current, wrong), wrong)

  return {
    detailText,
    easyText: el.coachWhy.textContent,
    detailHint,
    easyHint: el.modeHint.textContent,
    detailLabel,
    easyLabel: el.easy.textContent,
    easyOn: el.easy.classList.contains('on'),
    detailRef,
    easyRef: el.refAnswerWhy.textContent,
    stillAnswered: el.coach.hidden === false,
  }
})()`)

check(easyToggle.detailLabel.includes('くわしく'), 'トグルの初期表示は「くわしく」', easyToggle.detailLabel)
check(easyToggle.easyLabel.includes('やさしく') && easyToggle.easyOn, 'トグルを押すと「やさしく」になる', easyToggle.easyLabel)
check(
  easyToggle.easyText !== easyToggle.detailText && easyToggle.easyText.length > 0,
  '表示中のコーチ文がその場でやさしい版に書き換わる',
  easyToggle.easyText.slice(0, 40),
)
check(easyToggle.stillAnswered, 'トグルしても判定表示は消えない (出題がやり直されない)')
check(
  easyToggle.easyHint !== easyToggle.detailHint && easyToggle.easyHint.length > 0,
  'モードの説明文もやさしい版に切り替わる',
  easyToggle.easyHint.slice(0, 40),
)
check(
  easyToggle.easyRef !== easyToggle.detailRef && easyToggle.easyRef.includes('AQo'),
  '定石ビューアの答えもやさしい版に切り替わる',
  easyToggle.easyRef.slice(0, 40),
)

// やさしく のまま保存 → 読み戻せる
check(
  run(`(() => {
    saveState({ ...freshState(), easyMode: true })
    return loadState().easyMode === true
  })()`),
  '「やさしく」の設定が保存される',
)
check(run(`freshState().easyMode === false`), '初期値は「くわしく」')

// 後片付け
run(`commit({ ...state, easyMode: false, mode: 'rfi', focus: null }); renderEasy(state); renderModes(state, selectMode); selectReference(DRILLS[0].key); advance()`)

check(run('el.glossaryBody.children.length') > 0, '用語解説が描画されている')
check(run(`el.glossaryCount.textContent === String(GLOSSARY_TERM_COUNT)`), '用語数が見出しに出る')

const glossaryFilter = run(`(() => {
  renderGlossary('ドミネート')
  const hit = el.glossaryBody.children.length
  renderGlossary('ぽよよん')
  const miss = el.glossaryBody.children.length
  renderGlossary('')
  return { hit, miss, all: el.glossaryBody.children.length }
})()`)
check(glossaryFilter.hit > 0 && glossaryFilter.hit < glossaryFilter.all, '用語検索で絞り込める', JSON.stringify(glossaryFilter))
check(glossaryFilter.miss === 1, '当たらない検索は「ありません」の1行だけ', String(glossaryFilter.miss))

// ---- UI: よくあるミス / 勝率表 / 早見表 ----

check(run('el.mistakesBody.children.length') === run('MISTAKES.length'), 'よくあるミスが全件描画される')
check(
  run(`el.mistakesBody.children.every((item) => item.children.length === 3)`),
  'ミスの各項目が タイトル / なぜまずい / どうする を持つ',
)

// 勝率表: 169 マス、全部タップできて、タップすると勝率が出る
check(run('el.equityGrid.children.length') === 169, '勝率表が 169 マス描かれる')
const equityPick = run(`(() => {
  pickEquityHand('K7o')
  const first = { hidden: el.equityAnswer.hidden, text: el.equityAnswer.textContent }
  pickEquityHand('K7o') // トグルで解除
  const cleared = el.equityAnswer.hidden
  pickEquityHand('76s')
  const second = el.equityAnswer.textContent
  pickEquityHand('76s')
  return { first, cleared, second }
})()`)
check(
  equityPick.first.hidden === false && equityPick.first.text.includes('55.0%') && equityPick.first.text.includes('どの席からも開けない'),
  '勝率表: K7o をタップすると勝率と「勝率を実現しにくい」系の説明が出る',
  equityPick.first.text.slice(0, 60),
)
check(equityPick.first.text.includes('実現'), '勝率表: K7o に勝率≠期待値の注釈が付く', equityPick.first.text)
check(equityPick.cleared === true, '勝率表: もう一度タップすると閉じる')
check(
  equityPick.second.includes('45.2%') && equityPick.second.includes('全席で開ける') && equityPick.second.includes('化け'),
  '勝率表: 76s は勝率が低いのに開ける側の説明が出る',
  equityPick.second.slice(0, 60),
)

// 早見表: 開閉・タブ・中身
const sheetFlow = run(`(() => {
  const initial = el.sheet.hidden
  openSheet('positions')
  const positions = {
    hidden: el.sheet.hidden,
    tabs: el.sheetTabs.children.length,
    rows: el.sheetBody.children.find((c) => c.tagName === undefined || true) && el.sheetBody.children.length,
  }
  // ポジションのタブ: 6 席ぶんの行がある
  const positionTable = el.sheetBody.children.find((c) => c.children && c.children.some && c.children.some((x) => x.children))
  // スタブは子孫の textContent を集計しないので、再帰で拾う
  const collectText = (node) => {
    let text = node.textContent || ''
    for (const child of node.children || []) text += ' ' + collectText(child)
    return text
  }
  selectSheetPane('blinds')
  const blindsText = collectText(el.sheetBody)
  selectSheetPane('size')
  const sizeText = collectText(el.sheetBody)
  selectSheetPane('mantra')
  const mantraCount = el.sheetBody.children[0].children.length
  selectSheetPane('glossary')
  setSheetQuery('ドミネート')
  const glossaryChildren = el.sheetBody.children.length
  setSheetQuery('')
  closeSheet()
  return { initial, positions, blindsText, sizeText, mantraCount, closed: el.sheet.hidden, glossaryChildren }
})()`)
check(sheetFlow.initial === true, '早見表は最初は閉じている')
check(sheetFlow.positions.hidden === false && sheetFlow.positions.tabs === 5, '早見表が開いてタブが 5 つある', String(sheetFlow.positions.tabs))
check(sheetFlow.positions.rows > 0, '早見表: ポジションのタブに中身がある')
check(
  sheetFlow.blindsText.includes('0.5bb') && sheetFlow.blindsText.includes('二択') && sheetFlow.blindsText.includes('27'),
  '早見表: SB/BB タブに 二択・ポットオッズ (27%) が出る',
  sheetFlow.blindsText.slice(0, 80),
)
check(
  sheetFlow.sizeText.includes('2.5bb') && sheetFlow.sizeText.includes('7.5bb') && sheetFlow.sizeText.includes('10bb'),
  '早見表: サイズのタブに 2.5bb / 7.5bb / 10bb が出る',
)
check(sheetFlow.mantraCount === run('MANTRAS.length') * 2, '早見表: 合言葉が全件出る (dt+dd)', String(sheetFlow.mantraCount))
check(sheetFlow.glossaryChildren > 0, '早見表: 用語タブで検索できる')
check(sheetFlow.closed === true, '早見表が閉じられる')

// BB のポットオッズの主張 (1.5bb 払って 5.5bb のポット ≈ 27%) をデータから検算
const bbOdds = run(`(() => {
  const openBb = bbValue(RAISE_SIZE.DEFAULT)
  const cost = openBb - BLINDS.BB
  const pot = openBb * 2 + BLINDS.SB
  return { cost, pot, pct: (cost / pot) * 100 }
})()`)
check(
  bbOdds.cost === 1.5 && bbOdds.pot === 5.5 && Math.abs(bbOdds.pct - 27.3) < 0.5,
  '早見表: BB のポットオッズ計算 (1.5bb で 5.5bb を狙う ≈ 27%)',
  `${bbOdds.cost}bb / ${bbOdds.pot}bb = ${bbOdds.pct.toFixed(1)}%`,
)

// 席をタップすると早見表が開く配線 (renderQuestion 経由で seat-tappable が付いている)
const seatTappable = run(`(() => {
  renderQuestion(state, current, () => {}, () => {})
  return el.table.children
    .filter((c) => c.attributes.class && c.attributes.class.startsWith('seat '))
    .map((c) => c.attributes.class.includes('seat-tappable'))
})()`)
check(
  seatTappable.length === 6 && seatTappable.every(Boolean),
  '出題のテーブル図: 6 席全部がタップできる (早見表への入口)',
  JSON.stringify(seatTappable),
)

// 後片付け: 以降のチェックに狙い撃ち / サイズモードを持ち越さない
run(`commit({ ...state, focus: null, mode: 'rfi' }); advance()`)

// 次の問題に進むと色付けがリセットされる
const cleared = run(`(() => {
  advance()
  return el.actions.children.every((b) => ![...b.classList._set].some((c) => c.startsWith('is-')))
})()`)
check(cleared, '次の問題に進むとボタンの色付けが消える')

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
