// ビルド後の単一 HTML が本当に動くかを検証する。
// ソースが通っていても、インライン化で順序が壊れる / ファイルが落ちる事故は起こりうる。
//   node tools/build.mjs && node tools/verify-bundle.mjs

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
    add(...n) { n.forEach((x) => this._set.add(x)) },
    remove(...n) { n.forEach((x) => this._set.delete(x)) },
    toggle(n, f) { if (f === undefined) this._set.has(n) ? this._set.delete(n) : this._set.add(n); else if (f) this._set.add(n); else this._set.delete(n) },
    contains(n) { return this._set.has(n) },
  },
  set innerHTML(_) { this.children = [] },
  get innerHTML() { return '' },
  appendChild(c) { this.children.push(c); return c },
  setAttribute(k, v) { this.attributes[k] = v },
  addEventListener() {},
  focus() {},
})

for (const file of ['dist/trainer.html', 'dist/artifact.html']) {
  console.log(`\n--- ${file} ---`)
  const html = readFileSync(join(ROOT, file), 'utf8')

  check(!html.includes('<script src='), `${file}: 外部 JS 参照が残っていない`)
  check(!html.includes('<link rel="stylesheet"'), `${file}: 外部 CSS 参照が残っていない`)
  check(html.includes('<style>'), `${file}: CSS がインライン化されている`)

  if (file.endsWith('artifact.html')) {
    check(!/<!doctype|<html|<head|<body/i.test(html), `${file}: Artifact 用の外枠タグが無い`)
    check(html.includes('<title>'), `${file}: title がある`)
  }

  // インライン化された script を取り出して実際に走らせる
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  check(scripts.length === 1, `${file}: script ブロックは1つ`, `${scripts.length} 個`)

  const elements = new Map()
  const store = new Map()
  const context = {
    console: { log() {} },
    Math, JSON, Object, Array, Set, Map, String, Number, Error, Date,
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
  context.window = context
  vm.createContext(context)

  try {
    vm.runInContext(scripts[0], context, { filename: file })
    check(true, `${file}: バンドルが実行できて初期化まで走る`)
  } catch (error) {
    check(false, `${file}: バンドル実行`, `${error.name}: ${error.message}`)
    continue
  }

  const run = (code) => vm.runInContext(code, context)

  // ソース側と同じ結論が出るか (順序が壊れていれば ここで落ちる)
  check(run('DRILLS.length') === 19, `${file}: ドリルが 19 個`, String(run('DRILLS.length')))
  check(run('VS_RFI_DRILLS.length') === 14, `${file}: vs RFI が 14 スポット`)
  check(run('BOUNDARY_HANDS.length') === 54, `${file}: 境界ハンドが 54`, String(run('BOUNDARY_HANDS.length')))
  check(run('ALL_HANDS.length') === 169, `${file}: グリッドが 169 マス`)
  check(
    Math.abs(run(`100 - DRILL_BY_KEY['RFI_UTG'].foldBaseline`) - 16.1) < 0.1,
    `${file}: UTG レンジが 16.1%`,
  )
  check(
    run(`gradeAnswer({ drillKey: 'RFI_UTG', hand: 'AA' }, 'raise').isCorrect`),
    `${file}: 採点が動く`,
  )
  check(run('RFI_STEPS[4].removed.size') === 7, `${file}: SB で消える手が 7`, String(run('RFI_STEPS[4].removed.size')))
  check(run('current !== null'), `${file}: 初回の出題が生成されている`)

  // 後から足したファイル (coach / daily / glossary) がインライン化で落ちていないか
  check(run('SIZING_DRILLS.length') === 19, `${file}: サイズが 19 スポット`, String(run('SIZING_DRILLS.length')))
  check(
    run(`DRILL_BY_KEY['SIZE_CO_BTN'].answer === '7.5bb' && DRILL_BY_KEY['SIZE_UTG_BB'].answer === '10bb'`),
    `${file}: サイズが IP 7.5bb / OOP 10bb`,
  )
  check(run(`coachFor(DRILL_BY_KEY['RFI_UTG'], '98o').why.length > 0`), `${file}: コーチ文が出る`)
  check(run('dailyTasks(state).length') === 4, `${file}: 今日のメニューが 4 タスク`)
  check(run('GLOSSARY_TERM_COUNT') > 25, `${file}: 用語解説が入っている`, `${run('GLOSSARY_TERM_COUNT')} 語`)
  check(run('FAQ.length') >= 10, `${file}: よくある質問が入っている`, `${run('FAQ.length')} 件`)
  check(
    run(`coachFor(DRILL_BY_KEY['CO_BTN'], 'AJo', true).why !== coachFor(DRILL_BY_KEY['CO_BTN'], 'AJo', false).why`),
    `${file}: やさしい版とくわしい版が両方入っている`,
  )
  check(run(`coachFor(DRILL_BY_KEY['CO_BTN'], 'AJo', true).why.includes('キッカー負け')`), `${file}: やさしい版が動く`)
  check(run('MISTAKES.length') >= 10, `${file}: よくあるミスが入っている`, `${run('MISTAKES.length')} 件`)
  check(run('Object.keys(EQUITY_VS_RANDOM).length') === 169, `${file}: 勝率表が 169 ハンドぶん入っている`)
  check(Math.abs(run(`EQUITY_VS_RANDOM['AA']`) - 85.2) < 0.7, `${file}: 勝率のアンカー (AA) が正しい`)
  check(run(`(() => { openSheet('size'); const open = !el.sheet.hidden && el.sheetTabs.children.length === 5; closeSheet(); return open })()`), `${file}: 早見表が開く`)
  check(run('el.equityGrid.children.length') === 169, `${file}: 勝率グリッドが描画されている`)
  check(run(`MODES.some((m) => m.id === 'weakness')`), `${file}: 苦手モードが入っている`)
  check(run('fill !== null && fill.blanks.length === 12'), `${file}: レンジ穴埋めが初期化されている`)
  check(run(`FAQ.some((e) => e.q.includes('GTO'))`), `${file}: GTO の FAQ が入っている`)
  check(run(`threebetRoleOf(DRILL_BY_KEY['CO_BTN'], 'AJo') === 'bluff'`), `${file}: 役割分類が動く`)
  check(run('bluff !== null && bluff.hand !== null'), `${file}: 役割クイズが初期化されている`)
  check(Math.abs(run(`equityVs('AA', 'KK')`) - 81.9) < 1.2, `${file}: 対戦マトリクスが入っている (AA vs KK)`)
  check(run(`equityVs('J8s', 'J8s')`) === 50, `${file}: 対角は厳密に 50%`)
  check(run(`(() => { const r = solvePushFold(10); return r.exploitability < 0.02 && r.jamPct > 50 && r.jamPct < 65 })()`), `${file}: ナッシュソルバーが動く (10bb)`)
  check(run('el.calcGrid.children.length') === 169, `${file}: エクイティ電卓が描画されている`)
  check(run('el.nashSbGrid.children.length') === 169, `${file}: ソルバーのグリッドが描画されている`)
  check(run('el.dailyList.children.length') === 4, `${file}: メニューが描画されている`)
  check(run('el.glossaryBody.children.length') > 0, `${file}: 用語解説が描画されている`)
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
