// index.html + style.css + js/*.js を1枚の HTML に畳む。
//   node tools/build.mjs
//
// 出力は2種類:
//   dist/trainer.html  - 完全な単体 HTML (ローカル / 任意のホスティング用)
//   dist/artifact.html - Claude Artifact 用。Artifact 側が <!doctype>/<head>/<body> を被せるので、
//                        こちらはページ本体だけを出す (title は残す)。

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

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

mkdirSync(DIST, { recursive: true })
writeFileSync(join(DIST, 'trainer.html'), inlined)

// Artifact 用: 外枠を剥がして本体だけにする
const title = (inlined.match(/<title>([^<]*)<\/title>/) || [])[1] || 'プリフロップ レンジトレーナー'
const bodyInner = inlined.slice(inlined.indexOf('<body>') + '<body>'.length, inlined.lastIndexOf('</body>'))
const styleBlock = inlined.slice(inlined.indexOf('<style>'), inlined.indexOf('</style>') + '</style>'.length)

const artifact = `<title>${title}</title>\n${styleBlock}\n${bodyInner.trim()}\n`

if (/<!doctype|<html|<head|<body/i.test(artifact)) {
  throw new Error('Artifact 用の出力に外枠タグが残っている')
}

writeFileSync(join(DIST, 'artifact.html'), artifact)

const kb = (text) => `${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`
console.log(`dist/trainer.html   ${kb(inlined)}  (単体 HTML)`)
console.log(`dist/artifact.html  ${kb(artifact)}  (Artifact 用)`)
console.log(`inlined: style.css + ${scriptOrder.length} scripts`)
