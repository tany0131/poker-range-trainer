// 出題される「状況」の定義。RFI (自分から開ける) と vs RFI (レイズされた側) の2種類。

// 席順 = プリフロップの行動順。
const POSITIONS = [
  { id: 'UTG', label: 'UTG', full: 'アンダー・ザ・ガン (最初に行動)', character: '後ろに5人。最も絞る' },
  { id: 'HJ', label: 'HJ', full: 'ハイジャック', character: '後ろに4人。まだ堅く' },
  { id: 'CO', label: 'CO', full: 'カットオフ', character: '後ろに3人。攻め始める' },
  { id: 'BTN', label: 'BTN', full: 'ボタン (最も有利)', character: '常に最後に動く。最強' },
  { id: 'SB', label: 'SB', full: 'スモールブラインド', character: '広く開けるが以降は最初に動く' },
  { id: 'BB', label: 'BB', full: 'ビッグブラインド', character: '最後に行動できる。降りる手が最少' },
]

const POSITION_INDEX = Object.fromEntries(POSITIONS.map((p, i) => [p.id, i]))
const positionOf = (id) => POSITIONS[POSITION_INDEX[id]]

// フロップ以降の行動順はプリフロップと違う (ブラインドが先に動く)。
// サイズはポジションの有無で決まるので、こちらの順序で判定する。
const POSTFLOP_ORDER = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN']
const POSTFLOP_INDEX = Object.fromEntries(POSTFLOP_ORDER.map((id, i) => [id, i]))
const isHeroInPosition = (hero, raiser) => POSTFLOP_INDEX[hero] > POSTFLOP_INDEX[raiser]

// ---- RFI (自分より前が全員フォールド。オープンレイズするか) ----
// 6-max 100bb。combos 比が公開チャートの帯 (UTG 15-17 / HJ 19-22 / CO 25-30 / BTN 40-48 / SB 39-47%)
// に収まること、および UTG ⊂ HJ ⊂ CO ⊂ BTN を検算済み (tools/verify.mjs)。
// BB は「全員降りたら既に勝っている」ので RFI が存在しない。
const RFI_SPECS = {
  UTG: '22+,A9s+,A5s,A4s,A3s,K9s+,Q9s+,J9s+,T8s+,98s,87s,76s,AJo+,KQo',
  HJ: '22+,A2s+,K7s+,Q8s+,J8s+,T8s+,98s,87s,76s,ATo+,KJo+,QJo',
  CO: '22+,A2s+,K4s+,Q8s+,J8s+,T7s+,96s+,86s+,75s+,65s,A9o+,KTo+,QTo+,JTo',
  BTN: '22+,A2s+,K2s+,Q3s+,J4s+,T6s+,96s+,85s+,75s+,64s+,53s+,A4o+,K8o+,Q9o+,J9o+,T8o+,98o',
  SB: '22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,54s,A2o+,K9o+,Q9o+,J9o+,T9o',
}

const RAISE_SIZE = { SB: '3bb', DEFAULT: '2.5bb' }
const raiseSizeFor = (positionId) => RAISE_SIZE[positionId] || RAISE_SIZE.DEFAULT

// ---- bb とポット ----
//
// bb = ビッグブラインドの額を 1 とした単位。レートが変わっても話が通じるように金額では数えない。
// 「7.5bb」が何なのかを掴むには、卓にいくら落ちていて、自分の持ち金の何割を出すのかが要る。
// その計算をここに集めて、画面 (テーブル図・判定・コーチ) から使う。

const STACK_BB = 100 // このアプリは全スポット 100bb スタート
const BLINDS = { SB: 0.5, BB: 1 }
const BLIND_POT = BLINDS.SB + BLINDS.BB // 誰も動いていない時点で卓に落ちている額

// '7.5bb' → 7.5。逆は fmtBb。
const bbValue = (label) => Number(label.replace('bb', ''))
const fmtBb = (value) => `${Number(value.toFixed(2))}bb`

// その席がすでに出している額 (ブラインドは強制的に出させられている)
const postedBy = (positionId) => BLINDS[positionId] || 0

// 自分が動く直前にポットに入っている額。
const potBefore = (drill) =>
  drill.raiser ? BLIND_POT + bbValue(raiseSizeFor(drill.raiser)) : BLIND_POT

// その額まで上げるとき、実際に新しく出す額 (すでに出しているブラインドぶんは差し引く)。
const chipsToPut = (drill, sizeLabel) => bbValue(sizeLabel) - postedBy(drill.hero)

// ---- vs RFI (誰かがレイズ済み。フォールド / コール / 3bet) ----
//
// 出典: PokerCoaching "Implementable GTO Charts" (online 6-max, 100bb, 2.5x open) のチャートを
// 画素分類で抽出し、チャート自身が印字する combos 数をチェックサムに使って照合したもの。
// さらに pokertrainer.se の独立ソルブと 15 スポット全部で 3bet% が ~1.3pt 以内で一致することを確認済み。
//
// 意図的な単純化:
//  - ソルバーが混合戦略を取るハンドは、頻度の高い方の action に丸めてある (1ハンド1答にするため)。
//    そのぶん本来より数ポイント堅い。境界の細部は「流派」の範囲。
//  - SB は全スポットで 3bet オアフォールド (フラットを作らない)。OOP かつ BB が後ろに残るため。
//
// 意図的な欠番: BB vs SB。元チャートの SB はリンプ混合戦略 (レイズは 24% だけ) が前提だが、
// 本アプリの SB はレイズオンリー 41% で教えている。前提が食い違うので入れない。
const VS_RFI_SPECS = {
  UTG_HJ: {
    threebet: '99+,ATs+,A5s,KTs+,QJs,AQo+,KQo',
    call: '',
    note: 'UTG のオープンは最も強いレンジ。3bet オアフォールドで狭く戦う。',
  },
  UTG_CO: {
    threebet: '88+,ATs+,A5s,KTs+,QJs,AQo+,KQo',
    call: '',
    note: '背後に3人残るのでコールドコールはしない。3bet オアフォールド。',
  },
  UTG_BTN: {
    threebet: 'JJ+,AQs+,A9s-A8s,A4s-A3s,K9s,QJs,T9s,AKo,AJo,KQo',
    call: 'TT-99,AJs-ATs,A5s,KTs+,QTs,JTs,98s,86s+,75s+,64s+,AQo',
    note: 'BTN はポジションがあるので、UTG 相手でもまとまったコールレンジを持てる。',
  },
  UTG_SB: {
    threebet: '99+,ATs+,A5s,KTs+,QJs,AQo+',
    call: '',
    note: 'SB は OOP かつ BB が後ろに残るため完全に 3bet オアフォールド。',
  },
  UTG_BB: {
    threebet: 'JJ+,AQs+,A5s-A4s,KJs+,QJs,JTs,75s,64s,AKo',
    call: 'TT-99,AJs-A6s,A3s-A2s,KTs-K2s,QTs-Q5s,J9s-J8s,T7s+,95s+,84s+,76s,74s-73s,65s,63s,53s+,42s+,32s,AQo-ATo,KJo+,QJo,JTo',
    note: 'BB はポットオッズとアクションを閉じられる利点で広く守るが、UTG 相手なので約27%に留める。',
  },
  HJ_CO: {
    threebet: '88+,A9s+,A5s-A4s,KTs+,QJs,AJo+,KQo',
    call: '',
    note: '相手のレンジが少し緩む分、UTG 相手より 3bet を広げる。',
  },
  HJ_BTN: {
    threebet: 'JJ+,AQs+,A9s-A7s,A4s-A3s,KTs-K8s,QTs-Q9s,T9s,76s,AKo,AJo,KQo',
    call: 'TT-99,AJs-ATs,A5s,KJs+,QJs,JTs,97s+,87s,65s,54s,AQo',
    note: 'BTN は IP の利を活かし、3bet 中心 + ミドルペア / スーテッド系のコールを併用。',
  },
  HJ_SB: {
    threebet: '77+,ATs+,A5s,KTs+,QTs+,JTs,AQo+',
    call: '',
    note: 'SB は常に 3bet オアフォールド。UTG 相手よりわずかに広げる。',
  },
  HJ_BB: {
    threebet: 'TT+,AQs+,A9s,A5s-A4s,KTs+,K5s,QTs+,JTs,75s,64s,AKo',
    call: '99-88,AJs-ATs,A8s-A6s,A3s-A2s,K9s-K6s,K4s-K2s,Q9s-Q5s,J9s-J7s,T7s+,96s+,84s+,76s,74s-73s,65s,63s,53s+,43s,32s,AQo-A9o,KTo+,QTo+,JTo',
    note: 'BB の総ディフェンスは約30%。相手が後ろの席になるほど広がっていく。',
  },
  CO_BTN: {
    threebet: 'TT+,AQs+,A8s-A6s,A4s-A3s,KQs,K9s,QJs,Q9s,J9s+,65s,AKo,AJo-ATo,KJo+,QJo',
    call: '99-88,AJs-A9s,A5s,KJs-KTs,QTs,T9s,98s,87s,76s,AQo',
    note: 'CO のオープンは緩いので、BTN は 3bet を12%近くまで強く広げる。',
  },
  CO_SB: {
    threebet: '66+,A9s+,A5s,KTs+,QTs+,J9s+,T9s,AQo+,KQo',
    call: '',
    note: 'SB は 3bet オアフォールドのまま、CO 相手で11%まで拡大する。',
  },
  CO_BB: {
    threebet: '99+,AJs+,A9s,A5s-A4s,KTs+,Q9s+,J9s+,T9s,75s,64s,AQo+',
    call: 'ATs,A8s-A6s,A3s-A2s,K9s-K2s,Q8s-Q3s,J8s-J6s,T8s-T6s,95s+,84s+,76s,74s-73s,65s,63s-62s,53s+,43s,32s,AJo-A9o,A6o,KTo+,QTo+,JTo,T9o',
    note: 'BB の総ディフェンスは約33%。オフスーツのブロードウェイもコールに入り始める。',
  },
  BTN_SB: {
    threebet: '55+,A7s+,A5s-A4s,K9s+,Q9s+,J9s+,T8s+,AJo+,KJo+',
    call: '',
    note: 'SB は BTN のスチールに対し15%の 3bet オアフォールドで応戦する。',
  },
  BTN_BB: {
    threebet: '99+,ATs+,A6s-A4s,K9s+,Q9s+,J8s+,T8s+,97s+,86s,75s,64s,AQo+,KQo',
    call: '88-55,A9s-A7s,A3s-A2s,K8s-K2s,Q8s-Q2s,J7s-J2s,T7s-T2s,96s-94s,87s,85s-83s,76s,74s-72s,65s,63s-62s,52s+,42s+,32s,AJo-A4o,KJo-K7o,Q8o+,J8o+,T8o+,98o',
    note: 'BTN のオープンは最も緩いので、BB は半分近い手をディフェンスする。',
  },
}

// ---- 選べるアクション ----

const ACTIONS = {
  raise: { id: 'raise', label: 'レイズ', hotkey: 'r', tone: 'aggro' },
  threebet: { id: 'threebet', label: '3ベット', hotkey: 'r', tone: 'aggro' },
  call: { id: 'call', label: 'コール', hotkey: 'c', tone: 'passive' },
  fold: { id: 'fold', label: 'フォールド', hotkey: 'f', tone: 'fold' },
}

// ---- ドリル (= 1つの状況) ----
// RFI も vs RFI も同じ形にそろえる。出題・採点・成績はこの単位で扱う。

const buildRfiDrill = (positionId) => {
  const raiseSet = parseRange(RFI_SPECS[positionId])
  return {
    key: `RFI_${positionId}`,
    type: 'rfi',
    hero: positionId,
    raiser: null,
    label: positionId,
    title: `${positionOf(positionId).label} で最初の参加者になるか`,
    note: `${positionOf(positionId).full}。レイズサイズ ${raiseSizeFor(positionId)}。`,
    actions: [ACTIONS.raise, ACTIONS.fold],
    sets: { raise: raiseSet },
    answerFor: (hand) => (raiseSet.has(hand) ? 'raise' : 'fold'),
    // 全部フォールドを押すだけで取れてしまう正解率
    foldBaseline: 100 - pctOf(raiseSet),
  }
}

const buildVsRfiDrill = (key) => {
  const [raiser, hero] = key.split('_')
  const spec = VS_RFI_SPECS[key]
  const threebetSet = parseRange(spec.threebet)
  const callSet = parseRange(spec.call)

  for (const hand of threebetSet) {
    if (callSet.has(hand)) throw new Error(`${key}: ${hand} が 3bet と call の両方にある`)
  }

  const defense = pctOf(threebetSet) + pctOf(callSet)

  return {
    key,
    type: 'vsrfi',
    hero,
    raiser,
    label: `${raiser} → ${hero}`,
    title: `${raiser} がレイズ。${hero} のあなたはどうする`,
    note: spec.note,
    actions: callSet.size > 0 ? [ACTIONS.threebet, ACTIONS.call, ACTIONS.fold] : [ACTIONS.threebet, ACTIONS.fold],
    sets: { threebet: threebetSet, call: callSet },
    answerFor: (hand) => (threebetSet.has(hand) ? 'threebet' : callSet.has(hand) ? 'call' : 'fold'),
    foldBaseline: 100 - defense,
  }
}

const RFI_DRILLS = Object.keys(RFI_SPECS).map(buildRfiDrill)
const VS_RFI_DRILLS = Object.keys(VS_RFI_SPECS).map(buildVsRfiDrill)
const DRILLS = [...RFI_DRILLS, ...VS_RFI_DRILLS]

// ---- サイズ (いくら賭けるか) ----
//
// サイズはレンジと違って「どの手か」に依存しない (同じ額で打つから読まれない)。
// なので出題にハンドを出さない — 覚える中身は下の 2 本の規則だけで、
// カードを見せると「手によって額が変わる」という誤った印象を与える。
//
//  - オープン: 2.5bb。SB だけ 3bb (BB がすでに 1bb 出していて安く見に来られるため高く払わせる)
//  - 3ベット: オープン額の IP 3x / OOP (ブラインド) 4x。
//    OOP ほど大きくするのは、位置が悪いとフロップ以降でエクイティを実現しづらいから。
//    降ろす確率を上げ、続けるなら高く払わせる。
//
// vs RFI のオープンは全スポットで 2.5bb (レイザーは UTG/HJ/CO/BTN のみ) なので、
// 3ベット額は IP 7.5bb / OOP 10bb の 2 通りに収まる。
const OPEN_SIZE_OPTIONS = ['2bb', '2.5bb', '3bb', '4bb']
const THREEBET_SIZE_OPTIONS = ['5bb', '7.5bb', '10bb', '13bb']
const THREEBET_SIZE = { ip: '7.5bb', oop: '10bb' }

const sizeActions = (options) =>
  options.map((size, index) => ({ id: size, label: size, hotkey: String(index + 1), tone: 'size' }))

const buildSizingDrill = (spot) => {
  const isOpen = spot.type === 'rfi'
  const options = isOpen ? OPEN_SIZE_OPTIONS : THREEBET_SIZE_OPTIONS

  const answer = isOpen
    ? raiseSizeFor(spot.hero)
    : isHeroInPosition(spot.hero, spot.raiser)
      ? THREEBET_SIZE.ip
      : THREEBET_SIZE.oop

  if (!options.includes(answer)) throw new Error(`${spot.key}: サイズ ${answer} が選択肢にない`)

  return {
    key: `SIZE_${spot.key}`,
    type: 'sizing',
    hero: spot.hero,
    raiser: spot.raiser,
    label: spot.label,
    title: isOpen
      ? `${spot.hero} でオープンレイズ。いくらにするか`
      : `${spot.raiser} のレイズに ${spot.hero} が 3ベット。いくらにするか`,
    note: isOpen
      ? `${positionOf(spot.hero).full}。`
      : `${spot.hero} は ${isHeroInPosition(spot.hero, spot.raiser) ? 'IP (相手より後に動ける)' : 'OOP (相手より先に動く)'}。オープンは ${raiseSizeFor(spot.raiser)}。`,
    actions: sizeActions(options),
    answer,
    answerFor: () => answer,
    // 当てずっぽうで取れてしまう正解率。レンジのドリルの foldBaseline と同じ役割。
    foldBaseline: 100 / options.length,
  }
}

const SIZING_DRILLS = DRILLS.map(buildSizingDrill)

// レンジのドリルとサイズのドリルは集計の性質が違う (サイズにはミスの向きが無い) ので、
// 弱点分析が回る DRILLS とは分けたまま、キー引きだけ全部まとめる。
const ALL_DRILLS = [...DRILLS, ...SIZING_DRILLS]
const DRILL_BY_KEY = Object.fromEntries(ALL_DRILLS.map((d) => [d.key, d]))

// そのドリルを出題できるモード。狙い撃ちや日替わりメニューから飛ぶときに使う。
const defaultModeFor = (drill) =>
  drill.type === 'sizing' ? 'sizing' : drill.type === 'rfi' ? 'rfi' : 'vsrfi'

// レンジの「育ち方」。席が1つ進むと何が増えて何が消えるか。
// UTG ⊂ HJ ⊂ CO ⊂ BTN は成り立つが、SB は BTN の上位互換ではない (消える手がある) ので
// removed も持たせる。ここを隠すと「後ろほど広い」という誤った一般化を覚えてしまう。
const RFI_STEPS = RFI_DRILLS.map((drill, index) => {
  const previous = index > 0 ? RFI_DRILLS[index - 1].sets.raise : new Set()
  const currentSet = drill.sets.raise

  return {
    key: drill.key,
    hero: drill.hero,
    from: index > 0 ? RFI_DRILLS[index - 1].hero : null,
    added: new Set([...currentSet].filter((hand) => !previous.has(hand))),
    removed: new Set([...previous].filter((hand) => !currentSet.has(hand))),
    range: currentSet,
    pct: 100 - drill.foldBaseline,
  }
})

// 境界ハンド = ポジションによって答えが変わるハンド。
// 全席でレイズ (AA) や 全席でフォールド (72o) は考える必要がない。
// ここだけが「知識が要る」領域なので、特訓モードではここだけを出題する。
const BOUNDARY_HANDS = UNIQUE_HANDS.filter((hand) => {
  const raises = RFI_DRILLS.filter((d) => d.sets.raise.has(hand)).length
  return raises > 0 && raises < RFI_DRILLS.length
})

const BOUNDARY_HAND_SET = new Set(BOUNDARY_HANDS)
