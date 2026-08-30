// 不正解時に出すコーチ文 (なぜその答えか + 覚え方のこつ)。
// 文言はレンジデータ (spots.js) から導出する。手書きの解説を持たないので、正本とずれない。

const COACH_ACTION_SHORT = { raise: '開ける', threebet: '3ベット', call: 'コール', fold: '降り' }

const isBroadwayRank = (rank) => RANK_IDX[rank] <= RANK_IDX.T
const WHEEL_KICKERS = new Set(['5', '4', '3', '2'])

// 席ごとの開ける/開けないの並び。RFI_DRILLS の順 (= 行動順) を保つ。
const rfiOpenMap = (hand) => RFI_DRILLS.map((d) => [d.hero, d.sets.raise.has(hand)])
const rfiOpeners = (hand) => rfiOpenMap(hand).filter(([, open]) => open).map(([hero]) => hero)

// ヒーローの後ろに残っている人数 (プリフロップの行動順ベース)
const playersBehind = (hero) => POSITIONS.length - 1 - POSITION_INDEX[hero]

// ---- ポラライズ (3ベットレンジは強さの順ではない) ----
//
// AQo がコールなのに AJo が 3ベット、という「逆転」が全 BTN スポットで起きる。
// これはミスでも丸めの事故でもなく、3ベットレンジが バリュー + ブラフ の両端を取り、
// 真ん中の「コールに一番向いた手」をフラットに残すため (ポラライズド)。
//
// 逆転を機械的に見つけるために、同じ高いカード・同じスーテッドネスで
// キッカーだけが違う手 (AQo に対する AJo) を「兄弟」として比べる。
// ペアは高い/低いペアどうしを兄弟とみなす。

const kickerSiblings = (hand, direction) => {
  const step = direction === 'stronger' ? -1 : 1

  if (isPair(hand)) {
    const out = []
    for (let i = RANK_IDX[hand[0]] + step; i >= 0 && i < RANKS.length; i += step) {
      out.push(RANKS[i] + RANKS[i])
    }
    return out
  }

  const [high, low, suitedness] = hand
  const out = []
  for (let i = RANK_IDX[low] + step; i > RANK_IDX[high] && i < RANKS.length; i += step) {
    out.push(high + RANKS[i] + suitedness)
  }
  return out
}

// この手より強い兄弟がコールに回っているか (= この手はコール域より下のブラフ枠)
const calledAbove = (drill, hand) =>
  kickerSiblings(hand, 'stronger').find((sibling) => drill.sets.call.has(sibling)) || null

// この手より弱い兄弟が 3ベットに回っているか (= この手はフラットに残す「真ん中」)
const threebetBelow = (drill, hand) =>
  kickerSiblings(hand, 'weaker').find((sibling) => drill.sets.threebet.has(sibling)) || null

// ブラフ枠に選ばれる理由。エース・ブロードウェイはブロッカー、それ以外は化ける余地 (セミブラフ)。
const bluffStrength = (hand) => {
  if (hand[0] === 'A' && isSuited(hand) && WHEEL_KICKERS.has(hand[1])) {
    return `A を 1 枚ブロックして相手の AA / AK を減らしつつ、コールされてもフラッシュやホイール (A-2-3-4-5) に化ける — ブラフに最も向いた形`
  }
  if (hand[0] === 'A') {
    return `A が相手の AA / AK / AQ をブロックし、${hand[1]} が ${hand[1]}${hand[1]} や ${hand[0]}${hand[1]} をブロックする — 4ベットしてくる手をピンポイントで削れる`
  }
  if (isBroadwayRank(hand[0]) && isBroadwayRank(hand[1])) {
    return `${hand[0]} と ${hand[1]} が相手のブロードウェイや強いペアをブロックする`
  }
  return `スーテッドなぶん、コールされてもフラッシュやストレートに化ける (セミブラフ)`
}

// ---- RFI: なぜ ----

const rfiWhy = (drill, hand) => {
  const hero = drill.hero
  const openers = rfiOpeners(hand)

  if (openers.length === 0) {
    return `${hand} はどの席からも開けない手。後ろが何人に減っても参加は割に合わない。`
  }
  if (openers.length === RFI_DRILLS.length) {
    return `${hand} は全席で開ける手。ポジションを考える必要すらない。`
  }

  const earliest = openers[0]

  if (drill.answerFor(hand) === 'raise') {
    if (hero === earliest) {
      return `${hand} はちょうど ${hero} から開き始める境界の手。これより前の席では後ろに人が多すぎて割に合わない。`
    }
    return `${hand} は ${earliest} から開けられる手。${hero} なら後ろは ${playersBehind(hero)} 人まで減っているので、余裕を持って開けられる。`
  }

  const sbRemoved = RFI_STEPS[RFI_STEPS.length - 1].removed
  if (hero === 'SB' && sbRemoved.has(hand)) {
    return `${hand} は BTN では開けるのに SB では開けない ${sbRemoved.size} ハンドの 1 つ。SB はフロップ以降ずっと不利な席なので最下層の手を落とす。「後ろの席ほど広い」の唯一の例外。`
  }

  return `${hand} を開けられる最初の席は ${earliest}。${hero} ではまだ後ろに ${playersBehind(hero)} 人残っていて、この手では割に合わない。`
}

// ---- RFI: 覚え方 ----

const rfiTip = (drill, hand) => {
  const line = rfiOpenMap(hand)
    .map(([hero, open]) => `${hero} ${open ? '○' : '✕'}`)
    .join(' · ')
  const parts = [line]

  // オフスーツでつまずいたら、スーテッド版との格差を思い出させる
  if (!isPair(hand) && !isSuited(hand)) {
    const suitedHand = hand.slice(0, 2) + 's'
    const suitedOpeners = rfiOpeners(suitedHand)
    const offsuitOpeners = rfiOpeners(hand)
    const suitedEarlier =
      suitedOpeners.length > 0 &&
      (offsuitOpeners.length === 0 ||
        POSITION_INDEX[suitedOpeners[0]] < POSITION_INDEX[offsuitOpeners[0]])

    if (suitedEarlier) {
      parts.push(
        `同じ ${hand.slice(0, 2)} でも ${suitedHand} なら ${suitedOpeners[0]} から開けられる。「スーテッドは 2〜3 席ぶん格上げ」。`,
      )
    }
  }

  return parts.join(' — ')
}

// ---- vs RFI: なぜ ----

// 3ベットする手の「役割」。バリュー = 呼ばれても勝ちにいける / ブラフ = 降ろすのが主目的。
// 判定の分岐は vsRfiThreebetWhy と同じ順序で揃えてある (説明と役割クイズの答えがずれないように)。
// 実際のソルバー上ではグラデーションだが、1手1役に丸めるのはレンジの丸めと同じ設計判断。
const threebetRoleOf = (drill, hand) => {
  if (!drill.sets.threebet || !drill.sets.threebet.has(hand)) return null
  if (calledAbove(drill, hand)) return 'bluff'
  if (hand[0] === 'A' && isSuited(hand) && WHEEL_KICKERS.has(hand[1])) return 'bluff'
  if (isPair(hand) || (isBroadwayRank(hand[0]) && isBroadwayRank(hand[1]))) return 'value'
  return 'bluff'
}

const vsRfiThreebetWhy = (drill, hand) => {
  const sbSuffix =
    drill.hero === 'SB' ? ' SB にコールはない (3ベット・オア・フォールド) ので、続けるなら 3ベット一択。' : ''

  // 「自分より強い手がコールなのに、自分は 3ベット」= ポラライズの下側 (ブラフ枠)。
  // ここを「バリューだから 3ベット」と説明すると、真逆のことを覚えさせてしまう。
  const above = calledAbove(drill, hand)
  if (above) {
    return `強さの順なら ${above} のほうが上なのに、${above} はコールで ${hand} が 3ベット — 逆転して見える。3ベットレンジは強さの順ではなく、バリューとブラフの両端を取る形 (ポラライズド) だから。${hand} は ${above} に一段見劣りするのでコールでは分が悪いが、${bluffStrength(hand)}。「コールには弱すぎるが、ブラフとしては最良」の枠に入る。${sbSuffix}`
  }

  if (hand[0] === 'A' && isSuited(hand) && WHEEL_KICKERS.has(hand[1])) {
    return `${hand} はバリューではなくブラフ枠。A を 1 枚ブロックして相手の AA / AK を減らしつつ、コールされてもフラッシュやホイールを狙える。${sbSuffix}`
  }

  if (isPair(hand) || (isBroadwayRank(hand[0]) && isBroadwayRank(hand[1]))) {
    return `${hand} は ${drill.raiser} のオープンレンジに対して十分強い、バリュー寄りの 3ベット。コールで済ませると、弱い手に安くフロップを見せてしまう。${sbSuffix}`
  }

  return `${hand} はブラフ / セミブラフ枠の 3ベット。コールでは中途半端な手を、主導権ごと取りに行く。降ろせれば良し、コールされてもボードに絡める。${sbSuffix}`
}

const vsRfiCallWhy = (drill, hand) => {
  // 「自分より弱い手が 3ベットなのに、自分はコール」= ポラライズの真ん中。
  // 「3ベットするほど強くない」と説明すると嘘になる (弱いのではなく、3ベットが一番もったいない)。
  const below = threebetBelow(drill, hand)
  if (below) {
    // 席ごとの「なぜコールが成立するのか」は必ず残す (BB のオッズ / IP のポジション)。
    const edge =
      drill.hero === 'BB'
        ? 'BB はすでに 1bb 払っていて追加が安く、最後に行動して周を閉じられる'
        : `${drill.hero} にはポジションがあるので、フロップ以降つねに相手の行動を見てから動ける`

    return `${hand} は弱いからコール、ではない。3ベットが一番もったいない使い方だから残している。3ベットすると ${drill.raiser} は上位の手 (AK / QQ+ 級) で 4ベットしてきて、${hand} が勝っている弱い手は全部降りてしまう — 強い相手だけ残る。コールなら弱い手を卓に残したまま戦える。${edge}。その証拠に、${hand} より弱い ${below} のほうがブラフ枠として 3ベットに回っている。3ベットレンジは強さの順ではない (ポラライズド)。`
  }

  if (drill.hero === 'BB') {
    return `BB はすでに 1bb 払っていて追加が安く、この周を最後に閉じられる。だから他の席なら降りる ${hand} でも守れる。3ベットするほどの強さはない。`
  }

  return `${drill.hero} にはポジションがあるので、3ベットするほど強くない ${hand} をコールで参加させられる。フロップ以降つねに相手の行動を見てから動ける。`
}

const vsRfiFoldWhy = (drill, hand) => {
  const rfiDrill = DRILL_BY_KEY[`RFI_${drill.hero}`]
  const isOpenable = Boolean(rfiDrill && rfiDrill.sets.raise.has(hand))
  const sbSuffix =
    drill.hero === 'SB' ? ' しかも SB にコールという選択肢はなく、3ベットに足りなければフォールド一択。' : ''

  if (!isPair(hand) && !isSuited(hand) && isBroadwayRank(hand[0]) && isBroadwayRank(hand[1])) {
    return `${hand} のようなオフスーツのブロードウェイは、レイザーの AK / AQ / KQ にドミネートされやすい定番の罠。トップペアを作っても 2 番手になりやすい。${sbSuffix}`
  }

  if (drill.hero === 'SB' && isOpenable) {
    return `自分から開けるなら参加する ${hand} でも、SB にコールという選択肢はない。3ベットに足りなければフォールド一択。`
  }

  if (isOpenable) {
    return `自分から開けるなら参加する ${hand} も、先にレイズが入れば話が別。レイズへのディフェンスはオープンレンジより一段狭い。`
  }

  return `${hand} では ${drill.raiser} のオープンレンジに対して勝率が足りず、ポジションやオッズでも取り返せない。`
}

// ---- vs RFI: 覚え方 ----
// 同じ席で「レイザーがどこか」で答えがどう変わるかを1行にする。
// その席のスポットが1つしかない場合は、同じレイザーに対する席ごとの違いを見せる。

const vsRfiTip = (drill, hand) => {
  const sameHero = VS_RFI_DRILLS.filter((d) => d.hero === drill.hero)

  if (sameHero.length >= 2) {
    const answers = sameHero.map((d) => d.answerFor(hand))
    const line = sameHero
      .map((d, i) => `vs ${d.raiser} ${COACH_ACTION_SHORT[answers[i]]}`)
      .join(' · ')
    const moral =
      new Set(answers).size > 1
        ? 'レイザーが後ろの席になるほど広く守れる。'
        : 'この手はレイザーがどこでも同じ。'
    return `${hand} を ${drill.hero} で守るなら: ${line} — ${moral}`
  }

  const sameRaiser = VS_RFI_DRILLS.filter((d) => d.raiser === drill.raiser)
  const line = sameRaiser
    .map((d) => `${d.hero} ${COACH_ACTION_SHORT[d.answerFor(hand)]}`)
    .join(' · ')
  return `${hand} は ${drill.raiser} のレイズに対して: ${line}`
}

// ---- ヘッズアップ (残り2人・浅いスタック) ----
//
// 答えの出どころがソルバーなので、説明もソルバーの数字で書く。
// 押す側: 降ろして勝つ筋 + めくり合いで勝つ筋の二段構え。
// 受ける側: めくり合いの1本しかないので、必要勝率 (ポットオッズ) との比較がすべて。
// 数字は毎回その場で計算する (equityVsRange / HU_SETS) ので、レンジとずれない。

const HU_SHORT = { jam: '押す', call: 'コール', fold: '降り' }

// そのハンドを、全スタックでどうするか (8 押す · 10 押す · 15 降り)
const huStackLine = (drill, hand) =>
  HU_STACKS.map((stackBb) => {
    const other = DRILL_BY_KEY[`HU_${drill.seat === 'sb' ? 'PUSH' : 'CALL'}_${stackBb}`]
    return `${stackBb}bb ${HU_SHORT[other.answerFor(hand)]}`
  }).join(' · ')

const huWhy = (drill, hand) => {
  const stackBb = drill.stackBb
  const answer = drill.answerFor(hand)
  const freq = (drill.freqOf(hand) * 100).toFixed(0)

  if (drill.seat === 'sb') {
    const callSet = HU_SETS[stackBb].call
    const callPct = pctOf(callSet)
    const equity = equityVsRange(hand, callSet)

    if (answer === 'jam') {
      return `ソルバーはこの手を ${freq}% でオールインする。押す手の強みは勝ち筋が2本あること: BB がコールに回すのは全体の ${callPct.toFixed(0)}% だけなので ${(100 - callPct).toFixed(0)}% はそのまま ${fmtBb(huPot(drill))} を拾え、コールされても BB のコールレンジ相手に ${equity.toFixed(0)}% 残っている。${stackBb}bb ではレイズを作る余地が無いので、参加する価値がある手は全部この形で入れる。`
    }
    return `ソルバーがこの手をオールインする頻度は ${freq}%。BB のコールレンジ (全体の ${callPct.toFixed(0)}%) 相手に ${equity.toFixed(0)}% しかなく、降ろせるぶんを足しても ${stackBb}bb 丸ごと賭ける割に合わない。浅いほど押せる手は広がるが、この手はまだ下側にいる。`
  }

  const pushSet = HU_SETS[stackBb].push
  const pushPct = pctOf(pushSet)
  const need = huCallNeed(stackBb)
  const equity = equityVsRange(hand, pushSet)

  if (answer === 'call') {
    return `ソルバーはこの手を ${freq}% でコールする。受ける側は「降ろして勝つ」筋が無いので算数だけ: 追加 ${fmtBb(huCallCost(stackBb))} で ${fmtBb(2 * stackBb)} のポットを取りにいくから必要勝率は ${need.toFixed(0)}%。${hand} は相手の ${pushPct.toFixed(0)}% のジャムレンジ相手に ${equity.toFixed(0)}% あるので、${need.toFixed(0)}% を上回る = コールが得。`
  }
  return `ソルバーがこの手をコールする頻度は ${freq}%。必要勝率は ${need.toFixed(0)}% (追加 ${fmtBb(huCallCost(stackBb))} で ${fmtBb(2 * stackBb)} を取りにいく) だが、${hand} は相手の ${pushPct.toFixed(0)}% のジャムレンジ相手に ${equity.toFixed(0)}% しかない。足りないので降りる。相手のレンジが広くても、受ける側は押す側より必ず狭くなる。`
}

const huTip = (drill, hand) => {
  const line = `${hand}: ${huStackLine(drill, hand)}`
  const moral =
    drill.seat === 'sb'
      ? '浅いほど広く押す (8bb で 6割超、15bb で 5割弱)。押す側は降ろして勝てるぶん広い。'
      : `受ける側は押す側より必ず狭い (降ろして勝つ筋が無いから)。必要勝率は ${huCallNeed(drill.stackBb).toFixed(0)}%。`
  return `${line} — ${moral}`
}

// ---- サイズ ----

const sizingWhy = (drill) => {
  if (drill.type === 'sizing' && !drill.raiser) {
    if (drill.hero === 'SB') {
      return `SB だけ ${drill.answer} と大きい。BB はすでに 1bb 出しているので、他と同じ 2.5bb だと安すぎて必ず見に来られる。少し高く払わせて、降りるか高く払うかを選ばせる。`
    }
    return `オープンは席にかかわらず ${drill.answer}。小さすぎると誰でも見に来られ、大きすぎると降ろしたい相手まで降りて割に合わない。この額が分岐点。`
  }

  const inPosition = isHeroInPosition(drill.hero, drill.raiser)
  const multiple = inPosition ? '3x' : '4x'

  if (inPosition) {
    return `${drill.hero} は ${drill.raiser} より後に動ける (IP) ので、オープン ${raiseSizeFor(drill.raiser)} の ${multiple} = ${drill.answer}。位置がある側はフロップ以降で有利に立ち回れるから、安くして弱い手に付いてきてもらったほうが儲かる。`
  }

  const blindNote =
    drill.hero === 'SB'
      ? ' しかも後ろに BB が残っているので、安いと2人相手に最悪の位置で戦うことになる。'
      : ''

  return `${drill.hero} は ${drill.raiser} より先に動く (OOP) ので、オープン ${raiseSizeFor(drill.raiser)} の ${multiple} = ${drill.answer}。位置が悪いとフロップ以降でエクイティを実現しづらいぶん、降ろす確率を上げ、続けるなら高く払わせる。${blindNote}`
}

const sizingTip = (drill) => {
  // bb が抽象のままだと数字を覚えられないので、必ず「持ち金の何%」に翻訳して添える。
  const asPct = (label) => `${label} (持ち金の ${((bbValue(label) / STACK_BB) * 100).toFixed(1)}%)`

  if (drill.type === 'sizing' && !drill.raiser) {
    return `オープンは ${asPct('2.5bb')} 固定。例外は SB の 3bb だけ (BB を安く見に来させないため)。bb = ビッグブラインド1個ぶん、持ち金は 100bb。`
  }

  return `3ベットは「IP 3x / OOP 4x」の2本だけ。オープンが ${raiseSizeFor(drill.raiser)} なら IP ${asPct(THREEBET_SIZE.ip)} · OOP ${asPct(THREEBET_SIZE.oop)}。額は手の強さで変えない — 変えると読まれる。`
}

// ---- エントリポイント ----

// くわしい版。やさしい版は coach-easy.js (easyCoachFor) にある。
// 結論は必ず同じで、変えるのは説明の言葉づかいだけ。
const detailCoachFor = (drill, hand) => {
  if (drill.type === 'sizing') {
    return { why: sizingWhy(drill), tip: sizingTip(drill) }
  }

  if (drill.type === 'hu') {
    return { why: huWhy(drill, hand), tip: huTip(drill, hand) }
  }

  if (drill.type === 'rfi') {
    return { why: rfiWhy(drill, hand), tip: rfiTip(drill, hand) }
  }

  const correct = drill.answerFor(hand)
  const why =
    correct === 'threebet'
      ? vsRfiThreebetWhy(drill, hand)
      : correct === 'call'
        ? vsRfiCallWhy(drill, hand)
        : vsRfiFoldWhy(drill, hand)

  return { why, tip: vsRfiTip(drill, hand) }
}

// isEasy を渡すと、専門用語を使わない言い方に切り替える (答えは同じ)。
const coachFor = (drill, hand, isEasy = false) =>
  isEasy ? easyCoachFor(drill, hand) : detailCoachFor(drill, hand)
