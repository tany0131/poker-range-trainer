// ヘッズアップ (残り2人) の押し引きドリル。
//
// 扱うのは「浅くなったヘッズアップのオールインかフォールドか」だけ。
// 答えの出どころは外部チャートではなく、このアプリ自身のナッシュ均衡ソルバー
// (js/gto.js の solvePushFold) を tools/gen-hu.mjs で焼いた js/hu-ranges.js。
//
// 深いヘッズアップ (100bb のオープン/ディフェンス) は入れない。
// 検算できる出どころを持っていないので、入れると「正しいかどうか分からないレンジで
// 反復練習させる」ことになる — このアプリで最悪の失敗。FAQ にもそう書いてある。
//
// 席は6-max と違って2つだけ: ボタン (= SB を兼ねる。プリフロップは先、フロップ以降は後)
// と BB。ボタンは「オールインか降りるか」、BB は「コールか降りるか」の二択しかない。

// 頻度をどちらかの action に丸める境界。混合戦略を1ハンド1答にするのは
// vs RFI のレンジと同じ設計判断で、丸める前の頻度は判定文でそのまま見せる。
const HU_MAJORITY = 0.5

const huSetOf = (freqs) => new Set(UNIQUE_HANDS.filter((hand) => freqs[hand] >= HU_MAJORITY))

// スタックごとの「押す手」「コールする手」。生成物から丸めて作る。
const HU_SETS = Object.fromEntries(
  HU_STACKS.map((stackBb) => [
    stackBb,
    { push: huSetOf(HU_RANGES[stackBb].push), call: huSetOf(HU_RANGES[stackBb].call) },
  ]),
)

// ---- ポットと必要勝率 ----
//
// ボタンが押す前: 卓にはブラインドだけ (1.5bb)。
// BB が受ける前: ボタンの stackBb 全部 + BB の 1bb が入っている。
// BB がコールするのに足す額は stackBb - 1bb で、決着後のポットは 2×stackBb。
// つまり必要勝率 = (stackBb - 1) / (2 × stackBb) — 10bb なら 45%。
const huPot = (drill) => (drill.seat === 'sb' ? BLIND_POT : drill.stackBb + BLINDS.BB)
const huCallCost = (stackBb) => stackBb - BLINDS.BB
const huCallNeed = (stackBb) => (huCallCost(stackBb) / (2 * stackBb)) * 100

// ---- ドリル ----

const buildHuPushDrill = (stackBb) => {
  const pushSet = HU_SETS[stackBb].push

  return {
    key: `HU_PUSH_${stackBb}`,
    type: 'hu',
    seat: 'sb',
    stackBb,
    hero: 'SB',
    raiser: null,
    label: `プッシュ ${stackBb}bb`,
    title: `残り2人・${stackBb}bb。ボタン (SB) のあなたは押すか降りるか`,
    note: `持ち点が浅いのでレイズもコールも作らない。オールインか降りるかの二択。相手は1人。`,
    actions: [ACTIONS.jam, ACTIONS.fold],
    sets: { jam: pushSet },
    answerFor: (hand) => (pushSet.has(hand) ? 'jam' : 'fold'),
    foldBaseline: 100 - pctOf(pushSet),
    // 丸める前のソルバーの頻度 (判定文で見せる)
    freqOf: (hand) => HU_RANGES[stackBb].push[hand],
  }
}

const buildHuCallDrill = (stackBb) => {
  const callSet = HU_SETS[stackBb].call

  return {
    key: `HU_CALL_${stackBb}`,
    type: 'hu',
    seat: 'bb',
    stackBb,
    hero: 'BB',
    raiser: null,
    label: `コール ${stackBb}bb`,
    title: `残り2人・${stackBb}bb。ボタンがオールイン。BB のあなたは受けるか降りるか`,
    note: `追加 ${fmtBb(huCallCost(stackBb))} で ${fmtBb(2 * stackBb)} のポットを取りにいく — 必要勝率 ${huCallNeed(stackBb).toFixed(0)}%。`,
    actions: [ACTIONS.call, ACTIONS.fold],
    sets: { call: callSet },
    answerFor: (hand) => (callSet.has(hand) ? 'call' : 'fold'),
    foldBaseline: 100 - pctOf(callSet),
    freqOf: (hand) => HU_RANGES[stackBb].call[hand],
  }
}

const HU_DRILLS = [
  ...HU_STACKS.map(buildHuPushDrill),
  ...HU_STACKS.map(buildHuCallDrill),
]

// ---- 全ドリルの索引 ----
//
// ドリルを定義するファイルの最後がここなので、キー引きの索引もここで作る
// (spots.js に置くと、あとから足したヘッズアップのぶんを入れられない)。
// レンジのドリル (DRILLS) とサイズのドリルは性質が違うので、集計側は用途ごとに
// DRILLS / SIZING_DRILLS / HU_DRILLS を選ぶ。ここは「キーで引く」ためだけの一覧。
const ALL_DRILLS = [...DRILLS, ...SIZING_DRILLS, ...HU_DRILLS]
const DRILL_BY_KEY = Object.fromEntries(ALL_DRILLS.map((d) => [d.key, d]))

// そのドリルを出題できるモード。狙い撃ちや日替わりメニューから飛ぶときに使う。
const defaultModeFor = (drill) =>
  drill.type === 'sizing'
    ? 'sizing'
    : drill.type === 'hu'
      ? 'hu'
      : drill.type === 'rfi'
        ? 'rfi'
        : 'vsrfi'
