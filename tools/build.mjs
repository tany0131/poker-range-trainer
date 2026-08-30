// index.html + style.css + js/*.js を1枚の HTML に畳む。
//   node tools/build.mjs
//
// 出力:
//   dist/index.html    - GitHub Pages で配る本体 (trainer.html と同じ中身)
//   dist/trainer.html  - 完全な単体 HTML (ローカル / 任意のホスティング用)
//   dist/artifact.html - Claude Artifact 用。Artifact 側が <!doctype>/<head>/<body> を被せるので、
//                        こちらはページ本体だけを出す (title は残す)。
//                        クロスオリジンの iframe なので PWA の配線は落とす。
//   dist/manifest.webmanifest / dist/icons/* / dist/sw.js - PWA 一式
//
// sw.js の __BUILD_ID__ は畳んだ HTML のハッシュに置き換える。中身が変われば
// キャッシュ名が変わり、古いキャッシュが activate で捨てられる。
//
// アイコンの PNG は node tools/gen-icons.mjs で焼いてコミットしてある (ここでは複製するだけ)。

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

const ICON_FILES = ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']

const read = (relative) => readFileSync(join(ROOT, relative), 'utf8')

const html = read('index.html')
const css = read('style.css')

// index.html に書かれている順序をそのまま使う (依存順が壊れないように、勝手に並べ替えない)
const scriptOrder = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1])
if (scriptOrder.length === 0) throw new Error('index.html に <script src> が見つからない')

const scripts = scriptOrder.map((path) => `// ---- ${path} ----\n${read(path)}`).join('\n')

// インライン化した中身が </script> を含むと、そこで script が閉じてしまう
if (scripts.includes('</script>')) throw new Error('JS の中に </script> が含まれている')

const inlined = html
  .replace('<link rel="stylesheet" href="style.css" />', `<style>\n${css}\n</style>`)
  .replace(/\s*<script src="[^"]+"><\/script>/g, '')
  .replace('</body>', `  <script>\n${scripts}\n  </script>\n  </body>`)

if (inlined.includes('<script src=') || inlined.includes('<link rel="stylesheet"')) {
  throw new Error('外部参照が残っている')
}

// 属性なしのタグ = アプリ本体、という約束でバンドルを取り出している (verify-bundle も同じ読み方)。
// コメントや文章の中に素のタグ名を書くとそれごと拾われて壊れるので、ここで数える。
const plainScripts = (inlined.match(/<script>/g) || []).length
if (plainScripts !== 1) {
  throw new Error(`属性なしの script タグが ${plainScripts} 個ある (アプリ本体の 1 個だけのはず)`)
}

mkdirSync(DIST, { recursive: true })
writeFileSync(join(DIST, 'trainer.html'), inlined)
writeFileSync(join(DIST, 'index.html'), inlined) // Pages が最初に開くのはこちら

// Artifact 用: 外枠を剥がして本体だけにする。
// <head> ごと落ちるので manifest / apple の meta は自動的に消えるが、
// body 末尾の Service Worker 登録だけは明示的に外す (クロスオリジンの iframe で登録できない)。
const title = (inlined.match(/<title>([^<]*)<\/title>/) || [])[1] || 'プリフロップ レンジトレーナー'
const bodyInner = inlined
  .slice(inlined.indexOf('<body>') + '<body>'.length, inlined.lastIndexOf('</body>'))
  .replace(/\s*<script data-sw>[\s\S]*?<\/script>/g, '')
const styleBlock = inlined.slice(inlined.indexOf('<style>'), inlined.indexOf('</style>') + '</style>'.length)

const artifact = `<title>${title}</title>\n${styleBlock}\n${bodyInner.trim()}\n`

if (/<!doctype|<html|<head|<body/i.test(artifact)) {
  throw new Error('Artifact 用の出力に外枠タグが残っている')
}
if (artifact.includes('serviceWorker') || artifact.includes('manifest.webmanifest')) {
  throw new Error('Artifact 用の出力に PWA の配線が残っている')
}

writeFileSync(join(DIST, 'artifact.html'), artifact)

// ---- PWA 一式 ----

const buildId = createHash('sha256').update(inlined).digest('hex').slice(0, 12)

copyFileSync(join(ROOT, 'manifest.webmanifest'), join(DIST, 'manifest.webmanifest'))

mkdirSync(join(DIST, 'icons'), { recursive: true })
for (const file of ICON_FILES) {
  copyFileSync(join(ROOT, 'icons', file), join(DIST, 'icons', file))
}

const sw = read('sw.js').replaceAll('__BUILD_ID__', buildId)
if (sw.includes('__BUILD_ID__')) throw new Error('sw.js の build id を差し込めていない')
writeFileSync(join(DIST, 'sw.js'), sw)

const kb = (text) => `${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`
console.log(`dist/index.html     ${kb(inlined)}  (Pages で配る本体)`)
console.log(`dist/trainer.html   ${kb(inlined)}  (単体 HTML)`)
console.log(`dist/artifact.html  ${kb(artifact)}  (Artifact 用)`)
console.log(`dist/sw.js          build id ${buildId}`)
console.log(`dist/icons/         ${ICON_FILES.length} files + manifest.webmanifest`)
console.log(`inlined: style.css + ${scriptOrder.length} scripts`)
