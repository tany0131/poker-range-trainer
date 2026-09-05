// 「どれがブラフの 3ベットか」4択。役割クイズ (バリューかブラフか) の逆向き。
//
// 役割クイズは「この手は 3ベットする」と教えてから役割を訊く。こちらは 4 つ並べて
// 「3ベットするのはどれか」を訊く — 実戦で本当にやっているのはこちら側の判断で、
// 手札を見た瞬間に「これは入っている / 入っていない」を分けなければいけない。
//
// 外れの 3 つは、正解と見た目の似たフォールド帯の手から選ぶ。似ていない手を並べると
// 「一番強い手を選ぶ」で当たってしまい、ブラフ枠が何で選ばれているのか (ブロッカー・
// スーテッド・化け筋) を考えずに済んでしまう。

const BLUFF_PICK_CHOICES = 4

// 似ている候補の中から毎回同じ 3 つを出さないための遊び。狭すぎると同じ問題ばかりになる。
const BLUFF_PICK_POOL = 8

const shapeOf = (hand) => (isPair(hand) ? 'pair' : isSuited(hand) ? 'suited' : 'offsuit')
const gapOf = (hand) => RANK_IDX[hand[1]] - RANK_IDX[hand[0]]

// 「ぱっと見が似ている」の最低条件 = 同じ形 (ペア/スーテッド/オフスーツ) か、同じ最上位ランク。
// A5s の外れが 72o では問題にならない。
const looksLike = (hand, target) => shapeOf(hand) === shapeOf(target) || hand[0] === target[0]

// 似ている順に並べるための点数。形 > 最上位ランク > ランクの近さ > つながり方の順で効く。
const similarityTo = (target) => (hand) =>
  (shapeOf(hand) === shapeOf(target) ? 6 : 0) +
  (hand[0] === target[0] ? 4 : 0) +
  (hand[1] === target[1] ? 2 : 0) -
  Math.abs(RANK_IDX[hand[0]] - RANK_IDX[target[0]]) -
  Math.abs(RANK_IDX[hand[1]] - RANK_IDX[target[1]]) -
  Math.abs(gapOf(hand) - gapOf(target)) * 0.5

// ドリルごとに一度だけ数えて覚えておく (レンジは実行中に変わらない)。
const BLUFF_PICK_CACHE = {}

const bluffPickSetsOf = (drill) => {
  if (!BLUFF_PICK_CACHE[drill.key]) {
    BLUFF_PICK_CACHE[drill.key] = {
      // ブラフ枠の 3ベット = このクイズの正解になりうる手
      bluffs: [...drill.sets.threebet].filter((hand) => threebetRoleOf(drill, hand) === 'bluff'),
      // 外れはフォールド帯からだけ取る。コール帯を混ぜると「3ベットするのはどれ」の
      // 答えが 2 つあるように見える (コールも「降りない」ので)。
      folds: UNIQUE_HANDS.filter((hand) => drill.answerFor(hand) === 'fold'),
    }
  }
  return BLUFF_PICK_CACHE[drill.key]
}

// 4択が作れるスポットだけを対象にする (ブラフ枠が 1 つ以上、フォールド帯が 3 つ以上)。
const BLUFF_PICK_DRILLS = VS_RFI_DRILLS.filter((drill) => {
  const { bluffs, folds } = bluffPickSetsOf(drill)
  return bluffs.length > 0 && folds.length >= BLUFF_PICK_CHOICES - 1
})

// 正解に似たフォールド帯の手を 3 つ。似た手が足りないスポットでは、
// 見た目の条件を落として「一番近い手」から埋める (問題が作れないよりはよい)。
const bluffPickDecoys = (drill, hand) => {
  const { folds } = bluffPickSetsOf(drill)
  const wanted = BLUFF_PICK_CHOICES - 1

  const similar = folds.filter((fold) => looksLike(fold, hand))
  const pool = similar.length >= wanted ? similar : folds

  const score = similarityTo(hand)
  const ranked = [...pool].sort((a, b) => score(b) - score(a))
  return shuffled(ranked.slice(0, Math.max(wanted, BLUFF_PICK_POOL))).slice(0, wanted)
}

// view = { drillKey, hand (正解), choices (4 つ・並びはランダム), chosen, score }
const buildBluffPick = (drill, hand) => ({
  drillKey: drill.key,
  hand,
  choices: shuffled([hand, ...bluffPickDecoys(drill, hand)]),
  chosen: null,
})

const randomBluffPick = () => {
  const drill = randomOf(BLUFF_PICK_DRILLS)
  const { bluffs } = bluffPickSetsOf(drill)
  return buildBluffPick(drill, randomOf(bluffs))
}
