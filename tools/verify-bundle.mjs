// ビルド後の単一 HTML が本当に動くかを検証する。
// ソースが通っていても、インライン化で順序が壊れる / ファイルが落ちる事故は起こりうる。
//   node tools/build.mjs && node tools/verify-bundle.mjs

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

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
  _text: '',
  set textContent(value) { this._text = String(value); this.children = [] },
  get textContent() {
    const childText = this.children
      .map((child) => (child && typeof child === 'object' ? (child.text !== undefined ? child.text : child.textContent || '') : ''))
      .join('')
    return this._text + childText
  },
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
  // 遅延描画 (畳んだセクションは開くまで描かない) を発火できるように覚えておく
  _listeners: {},
  addEventListener(type, fn, options) {
    if (!this._listeners[type]) this._listeners[type] = []
    this._listeners[type].push({ fn, once: !!(options && options.once) })
  },
  dispatch(type) {
    const listeners = this._listeners[type] || []
    this._listeners[type] = listeners.filter((l) => !l.once)
    for (const listener of listeners) listener.fn({ type, target: this })
  },
  focus() {},
})

const LAZY_SECTIONS = [
  'growth', 'reference', 'fill', 'bluffq', 'equity',
  'calc', 'nash', 'faq', 'mistakes', 'help', 'glossary',
]

for (const file of ['dist/trainer.html', 'dist/artifact.html']) {
  console.log(`\n--- ${file} ---`)
  const html = readFileSync(join(ROOT, file), 'utf8')

  check(!html.includes('<script src='), `${file}: 外部 JS 参照が残っていない`)
  check(!html.includes('<link rel="stylesheet"'), `${file}: 外部 CSS 参照が残っていない`)
  check(html.includes('<style>'), `${file}: CSS がインライン化されている`)

  if (file.endsWith('artifact.html')) {
    check(!/<!doctype|<html|<head|<body/i.test(html), `${file}: Artifact 用の外枠タグが無い`)
    check(html.includes('<title>'), `${file}: title がある`)
    // Artifact はクロスオリジンの iframe。PWA の配線が残っていると例外を撒く。
    check(!html.includes('serviceWorker'), `${file}: Service Worker の登録が残っていない`)
    check(!html.includes('manifest.webmanifest'), `${file}: manifest への参照が残っていない`)
    check(!html.includes('apple-mobile-web-app'), `${file}: apple の meta が残っていない`)
  } else {
    check(html.includes('<link rel="manifest" href="manifest.webmanifest" />'), `${file}: manifest を参照している`)
    check(html.includes('rel="apple-touch-icon"'), `${file}: apple-touch-icon を参照している`)
    check(html.includes(`navigator.serviceWorker.register('./sw.js')`), `${file}: Service Worker を登録する`)
    check(
      html.includes(`location.protocol.startsWith('http')`),
      `${file}: file:// では登録しない (protocol で門番している)`,
    )
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

  // 畳んだセクションは開くまで描かれない。開いてから中身のチェックに入る。
  check(run('el.equityGrid.children.length') === 0, `${file}: 畳んだセクションは起動時に描かれない`)
  for (const id of LAZY_SECTIONS) {
    const node = elements.get(id)
    node.open = true
    node.dispatch('toggle')
  }

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
  check(run(`findTermSpans('ドミネートに注意').length`) === 1, `${file}: 用語リンクの検出が動く`)
  check(run(`GLOSSARY.some((g) => g.terms.some((t) => t.term === 'ソルバー'))`), `${file}: 用語集にソルバーとヘッズアップが入っている`)
  check(run(`Array.isArray(freshState().missLog) && el.missLogBody.children.length > 0`), `${file}: ミス履歴カードが初期化されている`)
  check(run('el.dailyList.children.length') === 4, `${file}: メニューが描画されている`)
  check(run('el.glossaryBody.children.length') > 0, `${file}: 用語解説が描画されている`)
}

// ---- PWA 一式 (dist に配るファイルが揃っているか) ----
//
// ここが欠けるとインストールできない / オフラインで落ちる。しかも見た目は普通に動くので
// 気づきにくい。名前と中身を毎回突き合わせる。

console.log('\n--- PWA ---')

check(
  readFileSync(join(DIST, 'index.html'), 'utf8') === readFileSync(join(DIST, 'trainer.html'), 'utf8'),
  'dist/index.html は trainer.html と同じ中身',
)

const manifestPath = join(DIST, 'manifest.webmanifest')
check(existsSync(manifestPath), 'dist/manifest.webmanifest がある')

let manifest = null
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  check(true, 'manifest が JSON として読める')
} catch (error) {
  check(false, 'manifest が JSON として読める', error.message)
}

if (manifest) {
  check(manifest.display === 'standalone', 'manifest: display は standalone', String(manifest.display))
  check(manifest.start_url === './' && manifest.scope === './', 'manifest: start_url / scope は相対 (./)')
  check(
    manifest.background_color === '#12151a' && manifest.theme_color === '#12151a',
    'manifest: 色がアプリの背景 (#12151a) と同じ',
  )
  check(manifest.short_name === 'レンジ', 'manifest: short_name は レンジ', String(manifest.short_name))

  const sizes = (manifest.icons || []).map((icon) => icon.sizes)
  check(sizes.includes('192x192') && sizes.includes('512x512'), 'manifest: 192 と 512 のアイコンがある', sizes.join(' '))
  check(
    (manifest.icons || []).some((icon) => (icon.purpose || '').includes('maskable')),
    'manifest: maskable のアイコンがある',
  )

  // manifest が指すアイコンが dist に実在するか
  const missingIcons = (manifest.icons || []).map((icon) => icon.src).filter((src) => !existsSync(join(DIST, src)))
  check(missingIcons.length === 0, 'manifest のアイコンが dist に全部ある', missingIcons.join(','))
}

for (const icon of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon.svg']) {
  const path = join(DIST, icon)
  check(existsSync(path) && statSync(path).size > 0, `dist/${icon} がある`)
}

const swPath = join(DIST, 'sw.js')
check(existsSync(swPath), 'dist/sw.js がある')

if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8')
  const buildId = (sw.match(/const BUILD_ID = '([^']*)'/) || [])[1] || ''

  check(!sw.includes('__BUILD_ID__'), 'sw.js: build id のプレースホルダが残っていない')
  check(/^[0-9a-f]{12}$/.test(buildId), 'sw.js: build id がバンドルのハッシュに差し替わっている', buildId)
  check(sw.includes('self.skipWaiting()'), 'sw.js: skipWaiting する')
  check(sw.includes('self.clients.claim()'), 'sw.js: clients.claim する')
  check(sw.includes('caches.delete(key)'), 'sw.js: 古いキャッシュを activate で捨てる')

  // 事前キャッシュの名前が dist に実在するか (無いものを addAll すると install ごと失敗する)
  const precache = [...(sw.match(/const PRECACHE = \[([\s\S]*?)\]/) || ['', ''])[1].matchAll(/'([^']+)'/g)].map(
    (m) => m[1],
  )
  check(precache.length >= 3, 'sw.js: 事前キャッシュの一覧がある', `${precache.length} 件`)

  const missing = precache.filter((entry) => {
    const relative = entry === './' ? 'index.html' : entry.replace(/^\.\//, '')
    return !existsSync(join(DIST, relative))
  })
  check(missing.length === 0, 'sw.js: 事前キャッシュが dist に実在するファイルだけを名指ししている', missing.join(','))
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
