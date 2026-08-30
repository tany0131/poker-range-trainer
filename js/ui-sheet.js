// 早見表 (右下のボタンからいつでも開けるシート) の描画。

const SHEET_PANES = [
  { id: 'positions', label: 'ポジション' },
  { id: 'blinds', label: 'SB / BB' },
  { id: 'size', label: 'サイズ' },
  { id: 'mantra', label: '合言葉' },
  { id: 'glossary', label: '用語' },
]

const sheetHeading = (text) => {
  const heading = document.createElement('h3')
  heading.className = 'sheet-h'
  heading.textContent = text
  return heading
}

const sheetNote = (text) => {
  const note = document.createElement('p')
  note.className = 'sheet-note'
  note.textContent = text
  return note
}

const sheetTable = (headers, rows) => {
  const table = document.createElement('table')
  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  for (const header of headers) {
    const th = document.createElement('th')
    th.textContent = header
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)
  table.appendChild(thead)

  const tbody = document.createElement('tbody')
  for (const row of rows) {
    const tr = document.createElement('tr')
    for (const cellText of row) {
      const td = document.createElement('td')
      td.textContent = cellText
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  return table
}

const sheetPositionsPane = (body) => {
  body.appendChild(sheetHeading('席は行動する順番 (毎ハンド 1 つずつ回る)'))
  body.appendChild(
    sheetTable(
      ['席', '正式名', '後ろ', '開く%', 'ひとこと'],
      POSITIONS.map((position) => {
        const rfi = DRILL_BY_KEY[`RFI_${position.id}`]
        return [
          position.label,
          position.full,
          `${playersBehind(position.id)} 人`,
          rfi ? `${(100 - rfi.foldBaseline).toFixed(0)}%` : '—',
          position.character,
        ]
      }),
    ),
  )
  body.appendChild(
    sheetNote('後ろの人数が少ないほど「自分が一番強い」確率が上がる → 後ろの席ほど広く開ける。'),
  )
  body.appendChild(
    sheetNote(
      `例外は SB。プリフロップでは後ろ 1 人なのに、カードが開いたあとはずっと最初に動く不利な席。だから BTN では開ける ${RFI_STEPS[RFI_STEPS.length - 1].removed.size} ハンドが SB では消える。BB は全員降りれば戦わずに勝ち — だから「開く%」が無い。`,
    ),
  )
}

const sheetBlindsPane = (body) => {
  // ポットオッズの数字はデータ (BLINDS / RAISE_SIZE) から都度計算する
  const openBb = bbValue(RAISE_SIZE.DEFAULT)
  const bbCallCost = openBb - BLINDS.BB
  const potAfterCall = openBb * 2 + BLINDS.SB
  const needPct = ((bbCallCost / potAfterCall) * 100).toFixed(0)

  body.appendChild(sheetHeading('SB — 見た目より悪い席'))
  body.appendChild(
    sheetNote('出した 0.5bb は「もう自分のお金ではない」。取り返そうとして参加する理由にしない。'),
  )
  body.appendChild(
    sheetNote('カードが開いたあと、SB はずっと最初に動く = 相手に情報を渡し続ける。だからレイズされたら常に「被せるか降りるか」の二択 (コールを作らない)。後ろに BB も残っている。'),
  )
  body.appendChild(
    sheetNote(`自分から開けるときは広く (41%)、ただしサイズは 3bb (他は 2.5bb)。BB に安く見に来させないため。`),
  )

  body.appendChild(sheetHeading('BB — 世界一安く戦える席'))
  body.appendChild(
    sheetNote(
      `すでに 1bb 払っているので、${RAISE_SIZE.DEFAULT} のオープンに付いていく追加はたった ${fmtBb(bbCallCost)}。コールした後のポットは ${fmtBb(potAfterCall)} なので、${needPct}% 勝てれば元が取れる計算 (ポットオッズ)。だから他の席なら捨てる手でも守れる。`,
    ),
  )
  body.appendChild(
    sheetNote('しかもプリフロップは BB が最後 — BB が決めればその周は終わり、後ろから被せられる心配がない。'),
  )

  body.appendChild(sheetHeading('BB の進め方 — 考える順番'))
  body.appendChild(
    sheetTable(
      ['順', 'やること'],
      [
        ['1', '手より先に、誰のレイズかを見る。レイザーが後ろの席ほど広く戦える'],
        ['2', '3ベットの手か？ 強い手 + ホイールエース系のブラフ枠なら上から被せる'],
        ['3', `コールの手か？ 追加 ${fmtBb(bbCallCost)} で ${fmtBb(potAfterCall)} を狙える。そろい・つながり・ペアは広く見に行く`],
        ['4', 'どれでもなければ降りる。「もう 1bb 払ったから」は理由にならない'],
      ],
    ),
  )
  body.appendChild(
    sheetTable(
      ['相手のレイズ', 'BB が戦う割合'],
      ['UTG', 'HJ', 'CO', 'BTN'].map((raiser) => [
        raiser,
        `${(100 - DRILL_BY_KEY[`${raiser}_BB`].foldBaseline).toFixed(0)}%`,
      ]),
    ),
  )
  body.appendChild(
    sheetNote('相手が後ろの席ほど相手の手は弱い → BB はどんどん広く守る。ただし「安いから何でも」ではない — vs UTG では 7 割降りる。'),
  )
}

const sheetSizePane = (body) => {
  const pctOfStack = (label) => `持ち金の ${((bbValue(label) / STACK_BB) * 100).toFixed(1)}%`

  body.appendChild(sheetHeading('額は手ではなく状況で決める (変えると読まれる)'))
  body.appendChild(
    sheetTable(
      ['場面', '額', 'それは'],
      [
        ['オープン (最初のレイズ)', RAISE_SIZE.DEFAULT, pctOfStack(RAISE_SIZE.DEFAULT)],
        ['オープン (SB だけ)', RAISE_SIZE.SB, pctOfStack(RAISE_SIZE.SB)],
        [`3ベット 有利な側 (相手より後に動ける)`, THREEBET_SIZE.ip, `オープンの 3 倍 = ${pctOfStack(THREEBET_SIZE.ip)}`],
        [`3ベット 不利な側 (SB / BB)`, THREEBET_SIZE.oop, `オープンの 4 倍 = ${pctOfStack(THREEBET_SIZE.oop)}`],
      ],
    ),
  )
  body.appendChild(
    sheetNote('不利な側ほど大きくする: 位置が悪いと勝率どおりに取れないので、その前に降りてもらう確率を上げる。有利な側は安くして付いてきてもらうほうが儲かる。'),
  )
  body.appendChild(
    sheetNote(`卓には最初から ${fmtBb(BLIND_POT)} 落ちていて、誰かが ${RAISE_SIZE.DEFAULT} 開けるとポットは ${fmtBb(BLIND_POT + bbValue(RAISE_SIZE.DEFAULT))}。間にコーラーが挟まったら 1 人につき +1bb 足すのが定番の調整。`),
  )
}

const sheetMantraPane = (body) => {
  const list = document.createElement('dl')
  list.className = 'glossary-list'
  for (const mantra of MANTRAS) {
    const phrase = document.createElement('dt')
    phrase.textContent = mantra.phrase
    const note = document.createElement('dd')
    note.textContent = mantra.note
    list.appendChild(phrase)
    list.appendChild(note)
  }
  body.appendChild(list)
}

const sheetGlossaryPane = (body, query, onQuery) => {
  const input = document.createElement('input')
  input.className = 'glossary-search'
  input.type = 'search'
  input.placeholder = '用語を検索 (説明文からも引けます)'
  input.value = query
  input.addEventListener('input', () => onQuery(input.value))
  body.appendChild(input)

  const container = document.createElement('div')
  buildGlossaryInto(container, query)
  body.appendChild(container)
}

const SHEET_BUILDERS = {
  positions: sheetPositionsPane,
  blinds: sheetBlindsPane,
  size: sheetSizePane,
  mantra: sheetMantraPane,
  glossary: sheetGlossaryPane,
}

const renderSheet = (paneId, query, onSelectPane, onQuery) => {
  el.sheetTabs.innerHTML = ''
  for (const pane of SHEET_PANES) {
    const button = document.createElement('button')
    button.className = `step-btn${pane.id === paneId ? ' active' : ''}`
    button.textContent = pane.label
    button.addEventListener('click', () => onSelectPane(pane.id))
    el.sheetTabs.appendChild(button)
  }

  el.sheetBody.innerHTML = ''
  SHEET_BUILDERS[paneId](el.sheetBody, query, onQuery)
}
