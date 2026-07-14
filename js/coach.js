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

const vsRfiThreebetWhy = (drill, hand) => {
  const sbSuffix =
    drill.hero === 'SB' ? ' SB にコールはない (3ベット・オア・フォールド) ので、続けるなら 3ベット一択。' : ''

  if (hand[0] === 'A' && isSuited(hand) && WHEEL_KICKERS.has(hand[1])) {
    return `${hand} はバリューではなくブラフ枠。A を 1 枚ブロックして相手の AA / AK を減らしつつ、コールされてもフラッシュやホイールを狙える。${sbSuffix}`
  }

  if (isPair(hand) || (isBroadwayRank(hand[0]) && isBroadwayRank(hand[1]))) {
    return `${hand} は ${drill.raiser} のオープンレンジに対して十分強い、バリュー寄りの 3ベット。コールで済ませると、弱い手に安くフロップを見せてしまう。${sbSuffix}`
  }

  return `${hand} はブラフ / セミブラフ枠の 3ベット。コールでは中途半端な手を、主導権ごと取りに行く。降ろせれば良し、コールされてもボードに絡める。${sbSuffix}`
}

const vsRfiCallWhy = (drill, hand) => {
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

// ---- エントリポイント ----

const coachFor = (drill, hand) => {
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
