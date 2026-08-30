// ヘッズアップ (浅いスタック) の押し引きレンジを計算して js/hu-ranges.js を生成する。
//   node tools/gen-hu.mjs
//
// 中身は「どこかのチャートの写し」ではなく、このアプリ自身の js/gto.js の
// solvePushFold (fictitious play で解くナッシュ均衡) をそのまま実行した結果。
// ソルバーは乱数を使わないので、何度回しても同じ数字になる。
//
// なぜ実行時に解かずに焼くのか: 1 スタックあたり 169×169 の反復で数十 ms かかるので、
// 出題のたびに解くと 1 問目が待たされる。答えは固定なので、ここで焼いてしまう。
//
// 検算は tools/verify.mjs 側でやる (焼いた値をその場のソルバーと突き合わせ、
// さらに公知のナッシュ解の帯 — 10bb で SB ジャム ~58% — に収まるかを見る)。

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// 焼くスタックの深さ (bb)。ここを変えたら js/spots-hu.js の HU_STACKS も追随する
// (spots-hu.js は生成物の中の HU_STACKS をそのまま読むので、実際には自動で揃う)。
const STACKS = [8, 10, 15]

// 頻度の丸め桁。verify がこの桁ぶんの誤差まで許して突き合わせる。
const DIGITS = 4

// ---- ソルバーを載せる (ブラウザと同じクラシックスクリプトを vm で実行) ----

const context = { console, Math, JSON, Object, Array, Set, Map, String, Number, Error }
vm.createContext(context)

// gto.js が要るのは ranges.js (ハンド一覧と combos) と matchups.js (対戦勝率) だけ。
for (const file of ['js/ranges.js', 'js/matchups.js', 'js/gto.js']) {
  vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), context, { filename: file })
}

const run = (code) => vm.runInContext(code, context)

// ---- 解く ----

const round = (value) => Number(value.toFixed(DIGITS))

const solutions = STACKS.map((stackBb) => {
  const started = Date.now()
  const result = run(`solvePushFold(${stackBb})`)
  console.log(
    `${stackBb}bb: ジャム ${result.jamPct.toFixed(1)}% / コール ${result.callPct.toFixed(1)}%` +
      ` / 搾取可能性 ${result.exploitability.toFixed(4)}bb (${Date.now() - started}ms)`,
  )
  return { stackBb, ...result }
})

// 「頻度 0.5 以上なら押す」で 1 ハンド 1 答に丸める設計なので、
// 丸め桁のせいで答えがひっくり返る手があると困る。境界からの距離を見ておく。
const hands = run('UNIQUE_HANDS')
const margins = solutions.flatMap((s) => [
  ...hands.map((hand) => Math.abs(s.jam[hand] - 0.5)),
  ...hands.map((hand) => Math.abs(s.call[hand] - 0.5)),
])
const closest = Math.min(...margins)
if (closest < 10 ** -DIGITS) {
  throw new Error(`頻度が 0.5 に近すぎて丸めで答えが変わる (最小マージン ${closest})`)
}
console.log(`0.5 からの最小マージン ${closest.toFixed(4)} (丸め ${10 ** -DIGITS} より大きいので安全)`)

// ---- 書き出し ----

const PER_LINE = 6

const formatMap = (freqs) => {
  // キーは必ずクォートする ('99' や '72o' は数字始まりで、裸だと識別子にならない)
  const entries = hands.map((hand) => `${JSON.stringify(hand)}: ${round(freqs[hand])}`)
  const lines = []
  for (let i = 0; i < entries.length; i += PER_LINE) {
    lines.push(`      ${entries.slice(i, i + PER_LINE).join(', ')},`)
  }
  return lines.join('\n')
}

const blocks = solutions
  .map(
    (s) => `  ${s.stackBb}: {
    // SB (ボタン) がオールインする頻度。ジャム ${s.jamPct.toFixed(1)}%
    push: {
${formatMap(s.jam)}
    },
    // BB がそのオールインをコールする頻度。コール ${s.callPct.toFixed(1)}%
    call: {
${formatMap(s.call)}
    },
  },`,
  )
  .join('\n')

const output = `// ヘッズアップ (浅いスタック) の押し引きレンジ。tools/gen-hu.mjs が生成する — 手で編集しない。
//
// 中身は js/gto.js の solvePushFold (ナッシュ均衡ソルバー) の出力そのもの。
// HU_RANGES[stack].push[hand] = SB (ボタン) がその手でオールインする頻度 0..1、
// HU_RANGES[stack].call[hand] = BB がオールインをコールする頻度 0..1。
// ソルバーは乱数を使わないので、再生成しても同じ値になる。
//
// 出題は「頻度 0.5 以上なら押す / コールする」に丸めて 1 ハンド 1 答にしている
// (レンジの混合戦略を丸めているのと同じ設計判断)。丸める前の頻度は判定文で見せる。

const HU_STACKS = [${STACKS.join(', ')}]

const HU_RANGES = {
${blocks}
}
`

writeFileSync(join(ROOT, 'js/hu-ranges.js'), output)
console.log(`js/hu-ranges.js を生成 (${STACKS.length} スタック × 169 ハンド × 2)`)
