// icons/icon.svg から PWA 用の PNG を焼く。
//   node tools/gen-icons.mjs
//
// 出力 (どれもコミットする。CI は焼かずに置いてあるものを配る):
//   icons/icon-192.png         ホーム画面 / Android
//   icons/icon-512.png         スプラッシュ / マスカブル
//   icons/apple-touch-icon.png iOS の「ホーム画面に追加」(180px)
//
// ラスタライズは macOS 標準の qlmanage (WebKit のサムネイル) + sips で行う。
// 外部パッケージを入れないための選択なので、macOS 以外では走らない。
// SVG が不正だと qlmanage は落ちずに「エラーを描いた白い画像」を焼くので、
// 焼き上がりの平均色が暗いことを最後に検品している (下の averageColor)。

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import zlib from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ICONS = join(ROOT, 'icons')
const SOURCE = join(ICONS, 'icon.svg')
const BASE_SIZE = 512

// icon.svg と同じ背景色。焼き上がりの検品に使う。
const BG = [0x12, 0x15, 0x1a]

const SIZES = [
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-192.png', size: 192 },
  { file: 'apple-touch-icon.png', size: 180 },
]

if (process.platform !== 'darwin') {
  throw new Error('qlmanage / sips が要るので macOS でしか焼けない (焼いた PNG はコミットしてある)')
}

const work = mkdtempSync(join(tmpdir(), 'range-icons-'))

try {
  execFileSync('qlmanage', ['-t', '-s', String(BASE_SIZE), '-o', work, SOURCE], { stdio: 'ignore' })
  const rendered = join(work, 'icon.svg.png')

  mkdirSync(ICONS, { recursive: true })

  for (const { file, size } of SIZES) {
    const out = join(ICONS, file)
    copyFileSync(rendered, out)
    if (size !== BASE_SIZE) {
      execFileSync('sips', ['-z', String(size), String(size), out], { stdio: 'ignore' })
    }
    const bytes = readFileSync(out).length
    console.log(`icons/${file}  ${size}x${size}  ${(bytes / 1024).toFixed(1)} KB`)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}

// ---- 焼き上がりの検品 ----
//
// SVG が不正なとき qlmanage は落ちずに「白い紙に赤枠のエラー画像」を焼く (実際に一度踏んだ)。
// 1x1 に潰した平均色を見れば、その事故は明るさで判別できる。

const averageColor = (pngPath) => {
  const scratch = mkdtempSync(join(tmpdir(), 'range-icons-check-'))
  try {
    const one = join(scratch, 'one.png')
    copyFileSync(pngPath, one)
    execFileSync('sips', ['-z', '1', '1', one], { stdio: 'ignore' })

    // 1x1 の PNG は、どのフィルタでも「左と上が 0」なので生の画素値がそのまま入っている
    const png = readFileSync(one)
    let offset = 8
    let colorType = null
    const idat = []
    while (offset < png.length) {
      const length = png.readUInt32BE(offset)
      const type = png.toString('ascii', offset + 4, offset + 8)
      const body = png.subarray(offset + 8, offset + 8 + length)
      if (type === 'IHDR') colorType = body[9]
      if (type === 'IDAT') idat.push(body)
      offset += length + 12
    }
    const raw = zlib.inflateSync(Buffer.concat(idat))
    if (colorType !== 2 && colorType !== 6) return null // パレット等は見ない
    return [raw[1], raw[2], raw[3]] // [0] はフィルタ種別
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

const average = averageColor(join(ICONS, 'icon-512.png'))
if (average) {
  const brightness = (average[0] + average[1] + average[2]) / 3
  console.log(`平均色 rgb(${average.join(', ')})  明るさ ${brightness.toFixed(0)}`)
  if (brightness > 128) {
    throw new Error('焼き上がりが明るすぎる — SVG のエラー画像を焼いていないか (icon.svg を見直す)')
  }
} else {
  console.log('平均色は読めなかった (検品はスキップ)')
}

console.log(`背景色 #${BG.map((v) => v.toString(16).padStart(2, '0')).join('')} / アクセント #e0b040`)
console.log('焼き直したら icons/*.png もコミットすること')
