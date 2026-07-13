// ハンド表記 (AKs) から、実際に表示する2枚のカード (スート付き) を起こす。
// 表示専用。判定ロジックはスートを見ない (AKs はどのスートでも AKs)。

const SUITS = [
  { id: 's', glyph: '♠', color: 'black' },
  { id: 'h', glyph: '♥', color: 'red' },
  { id: 'd', glyph: '♦', color: 'red' },
  { id: 'c', glyph: '♣', color: 'black' },
]

const pickSuit = () => SUITS[Math.floor(Math.random() * SUITS.length)]

const pickTwoDistinctSuits = () => {
  const first = pickSuit()
  const rest = SUITS.filter((suit) => suit.id !== first.id)
  const second = rest[Math.floor(Math.random() * rest.length)]
  return [first, second]
}

const dealCards = (hand) => {
  if (isPair(hand)) {
    const [a, b] = pickTwoDistinctSuits()
    return [
      { rank: hand[0], suit: a },
      { rank: hand[1], suit: b },
    ]
  }

  const [hi, lo] = hand

  if (isSuited(hand)) {
    const suit = pickSuit()
    return [
      { rank: hi, suit },
      { rank: lo, suit },
    ]
  }

  const [a, b] = pickTwoDistinctSuits()
  return [
    { rank: hi, suit: a },
    { rank: lo, suit: b },
  ]
}
