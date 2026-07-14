// コーチ文の「やさしい」版。
//
// くわしい版 (coach.js) と同じ場面に、同じ結論を、専門用語を使わずに書く。
// 方針:
//   - 用語をそのまま出さない。出すときは必ずその場で言い換える
//     (ドミネート → 「もう1枚で負ける (キッカー負け)」)
//   - 「なぜ」は必ず "相手が何人残っているか / 誰が先に話すか / 何が起きるか" の
//     具体に落とす。抽象語で言い換えただけの文章は書かない
//   - 結論はくわしい版と必ず同じ。やさしくするために答えを変えない
//
// 判定は全部 coach.js の共通ヘルパ (rfiOpeners / calledAbove / …) を使う。
// レンジデータが正本なのは同じで、ここで別の事実を持たない。

// ---- RFI ----

const easyRfiWhy = (drill, hand) => {
  const hero = drill.hero
  const openers = rfiOpeners(hand)
  const behind = playersBehind(hero)

  if (openers.length === 0) {
    return `${hand} は、どの席からでも降りる手。弱い部類なので、うしろの人数が減っても参加する価値が出てこない。考えずに降りていい手です。`
  }
  if (openers.length === RFI_DRILLS.length) {
    return `${hand} は、どの席からでも出す手。強いので席を考える必要すらありません。迷わずレイズ。`
  }

  const earliest = openers[0]

  if (drill.answerFor(hand) === 'raise') {
    return `あなたの席は ${hero}。うしろに残っているのは ${behind} 人です。うしろの人数が少ないほど「自分の手が一番強い」可能性が上がるので、そこそこの手でも出していけます。${hand} は ${earliest} から出せるようになる手なので、${hero} なら十分。`
  }

  const sbRemoved = RFI_STEPS[RFI_STEPS.length - 1].removed
  if (hero === 'SB' && sbRemoved.has(hand)) {
    return `SB は「見た目より悪い席」です。今はうしろに BB しかいませんが、カードが場に開かれたあとは、あなたがずっと最初に話す番になります。先に話すのはとても不利。だから BTN では出せる ${hand} も、SB では降ります。`
  }

  return `あなたの席は ${hero}。うしろにまだ ${behind} 人も残っていて、その誰かが強い手を持っているかもしれません。${hand} ではその人たちに勝てる見込みが足りないので降ります。この手を出せるようになるのは ${earliest} から。`
}

const easyRfiTip = (drill, hand) => {
  const line = rfiOpenMap(hand)
    .map(([hero, open]) => `${hero} ${open ? '出す' : '降りる'}`)
    .join(' · ')

  const parts = [`${hand}: ${line}`]

  if (!isPair(hand) && !isSuited(hand)) {
    const suitedHand = `${hand.slice(0, 2)}s`
    const suitedOpeners = rfiOpeners(suitedHand)
    const offsuitOpeners = rfiOpeners(hand)
    const suitedEarlier =
      suitedOpeners.length > 0 &&
      (offsuitOpeners.length === 0 ||
        POSITION_INDEX[suitedOpeners[0]] < POSITION_INDEX[offsuitOpeners[0]])

    if (suitedEarlier) {
      parts.push(
        `マークがそろっているだけで、ずっと強くなります。同じ ${hand.slice(0, 2)} でも、そろっていれば (${suitedHand}) ${suitedOpeners[0]} から出せる。迷ったら「マークはそろっているか」を最初に見る。`,
      )
    }
  }

  return parts.join(' — ')
}

// ---- vs RFI ----

const easyThreebetWhy = (drill, hand) => {
  const sbNote = drill.hero === 'SB' ? ' SB には「コール」がないので、続けるなら上から被せるしかありません。' : ''

  // 「自分より強い手がコールなのに、自分は上から被せる」の逆転。ここが一番つまずく場所。
  const above = calledAbove(drill, hand)
  if (above) {
    return `一見おかしく見えます。${above} のほうが強いのに、${above} はコールで、${hand} は上から被せる (3ベット)。でもこれで合っています。強い順に上から被せているのではないからです。${hand} でコールすると、ペアができても相手の ${above} 級に「もう1枚」で負けやすい (キッカー負け)。かといって降りるには惜しい。そこで、相手を降ろしにいく役として使います。あなたが ${hand[0]} と ${hand[1]} を持っている分、相手がその強い組み合わせを持つ確率は下がっているので、降りてくれやすいのです。${sbNote}`
  }

  if (hand[0] === 'A' && isSuited(hand) && WHEEL_KICKERS.has(hand[1])) {
    return `${hand} は「強いから」ではなく「降ろしにいく」ために被せる手です。A を1枚持っているので、相手が AA や AK を持つ確率が下がる = 降りてくれやすい。しかも降りてくれなくても、マークがそろっているので大きな手に化ける目があります。${sbNote}`
  }

  if (isPair(hand) || (isBroadwayRank(hand[0]) && isBroadwayRank(hand[1]))) {
    return `${hand} は、${drill.raiser} がレイズしてくるような手の中でも上位に入る強さです。コールで済ませると相手に安く見られてしまうので、上から被せて (3ベット) 大きなポットを作りにいきます。${sbNote}`
  }

  return `${hand} は今の時点では強くありませんが、カードが開けば大きな手に化ける可能性があります。上から被せて相手が降りれば勝ち。降りなくても化ける目が残っている、という二段構えの手です。${sbNote}`
}

const easyCallWhy = (drill, hand) => {
  const below = threebetBelow(drill, hand)

  const edge =
    drill.hero === 'BB'
      ? 'BB はもう 1bb 払わされているので、続けるのに足す額が他の席より少なくて済みます。しかも最後に話せる'
      : `${drill.hero} は相手より後に話せる (有利な) 席です`

  if (below) {
    return `${hand} は「弱いからコール」ではありません。上から被せる (3ベット) のが一番もったいないからコールなのです。被せると、${drill.raiser} は AK や QQ のような強い手だけで向かってきて、${hand} が勝てるはずの弱い手は全部降りてしまいます。つまり勝てる相手だけ逃がしてしまう。コールなら弱い相手を残したまま戦えます。${edge}。その証拠に、${hand} より弱い ${below} のほうが「降ろしにいく役」として被せに回っています。`
  }

  if (drill.hero === 'BB') {
    return `${edge}ので、他の席なら降りるような ${hand} でも「安いから見に行く」ができます。ただし上から被せるほどの強さはないので、コールで参加します。`
  }

  return `${edge}。カードが開いたあとも、相手の出方を見てから決められます。${hand} は被せるほど強くはないけれど、この有利さを使って安く参加する価値があります。`
}

const easyFoldWhy = (drill, hand) => {
  const rfiDrill = DRILL_BY_KEY[`RFI_${drill.hero}`]
  const isOpenable = Boolean(rfiDrill && rfiDrill.sets.raise.has(hand))

  if (!isPair(hand) && !isSuited(hand) && isBroadwayRank(hand[0]) && isBroadwayRank(hand[1])) {
    const sbNote = drill.hero === 'SB' ? ' しかも SB にはコールがないので、なおさら降りるしかありません。' : ''
    return `${hand} は絵札が2枚あって強そうに見えます。ここが一番の罠です。先にレイズしている相手は AK・AQ・KQ のような手を持っていることが多く、あなたが ${hand[0]} や ${hand[1]} でペアを作っても、相手のほうが「もう1枚」で上 = 負けます (キッカー負け)。強そうに見えるのに勝てない、典型的な負けパターンなので降ります。${sbNote}`
  }

  if (drill.hero === 'SB' && isOpenable) {
    return `自分から先に出すなら参加する ${hand} ですが、SB には「コール」という選択肢がありません。上から被せるか降りるかの二択で、被せるには足りないので降ります。`
  }

  if (isOpenable) {
    return `自分から先に出すなら参加する ${hand} ですが、すでに ${drill.raiser} がレイズしています。レイズは「強い手を持っている」という宣言です。自分から仕掛けるときより、ずっと強い手でないと向かえません。`
  }

  return `${hand} では、${drill.raiser} がレイズしてくるような手に勝てる見込みが足りません。席の有利さや値段の安さでも取り返せないので降ります。`
}

const easyVsRfiTip = (drill, hand) => {
  const shortWords = { threebet: '被せる', call: 'コール', fold: '降りる' }
  const sameHero = VS_RFI_DRILLS.filter((d) => d.hero === drill.hero)

  if (sameHero.length >= 2) {
    const line = sameHero.map((d) => `${d.raiser} のレイズ → ${shortWords[d.answerFor(hand)]}`).join(' · ')
    const answers = sameHero.map((d) => d.answerFor(hand))
    const moral =
      new Set(answers).size > 1
        ? 'レイズした人が後ろの席なほど、その人の手は弱いので、こちらは広く戦えます。'
        : 'この手は、誰がレイズしてきても同じ答えです。'
    return `${drill.hero} で ${hand} を持ったとき: ${line} — ${moral}`
  }

  const sameRaiser = VS_RFI_DRILLS.filter((d) => d.raiser === drill.raiser)
  const line = sameRaiser.map((d) => `${d.hero} なら ${shortWords[d.answerFor(hand)]}`).join(' · ')
  return `${drill.raiser} のレイズに対して ${hand} は: ${line}`
}

// ---- サイズ ----

const easySizingWhy = (drill) => {
  const bbNote = `(bb = いちばん安い賭け金1個ぶんの単位。持ち金は ${STACK_BB}bb なので、${drill.answer} は持ち金の ${((bbValue(drill.answer) / STACK_BB) * 100).toFixed(1)}% くらい)`

  if (!drill.raiser) {
    if (drill.hero === 'SB') {
      return `SB だけ ${drill.answer} と少し高くします。BB はもう 1bb 払っているので、他と同じ額だと「安いしとりあえず見るか」と必ず付いてこられてしまう。少し高くして、降りるか高く払うかを選ばせます。${bbNote}`
    }
    return `最初に出すときは、どの席でも ${drill.answer}。小さすぎると誰でも安く付いてこられるし、大きすぎると降りてほしくない相手 (勝てる相手) まで降りてしまいます。ちょうどいいのがこの額。${bbNote}`
  }

  const inPosition = isHeroInPosition(drill.hero, drill.raiser)

  if (inPosition) {
    return `${drill.hero} は ${drill.raiser} より後に話せる = 有利な側です。有利なときは相手のレイズの3倍 = ${drill.answer}。有利なので、むしろ安くして相手に付いてきてもらったほうが、あとで儲けられます。${bbNote}`
  }

  const sbNote = drill.hero === 'SB' ? ' しかも SB は後ろに BB が残っているので、安いと2人相手に一番不利な位置で戦うことになります。' : ''
  return `${drill.hero} は ${drill.raiser} より先に話す = 不利な側です。不利なときは相手のレイズの4倍 = ${drill.answer}。先に話す側はカードが開いたあとずっとやりにくいので、その前に降りてもらう確率を上げたい。だから高くします。${sbNote}${bbNote}`
}

const easySizingTip = (drill) => {
  if (!drill.raiser) {
    return `最初に出す額は 2.5bb でおぼえる。例外は SB の 3bb だけ。手の強さでは変えません — 強いときだけ大きくしていたら、額を見ただけで手を読まれてしまうからです。`
  }
  return `上から被せる額は2つだけ。相手より後に話せる (有利) なら ${THREEBET_SIZE.ip}、先に話す (不利) なら ${THREEBET_SIZE.oop}。手の強さでは変えません — 変えると額から手を読まれます。`
}

// ---- エントリポイント ----

const easyCoachFor = (drill, hand) => {
  if (drill.type === 'sizing') {
    return { why: easySizingWhy(drill), tip: easySizingTip(drill) }
  }

  if (drill.type === 'rfi') {
    return { why: easyRfiWhy(drill, hand), tip: easyRfiTip(drill, hand) }
  }

  const correct = drill.answerFor(hand)
  const why =
    correct === 'threebet'
      ? easyThreebetWhy(drill, hand)
      : correct === 'call'
        ? easyCallWhy(drill, hand)
        : easyFoldWhy(drill, hand)

  return { why, tip: easyVsRfiTip(drill, hand) }
}
