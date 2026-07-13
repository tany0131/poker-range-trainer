// 効果音。外部ファイルを持たず WebAudio で合成する (単一フォルダで完結させるため)。

const TONE = {
  correct: { freq: 880, duration: 0.09, gain: 0.05 },
  wrong: { freq: 190, duration: 0.16, gain: 0.06 },
  streak: { freq: 1320, duration: 0.07, gain: 0.05 },
}

let audioContext = null

// AudioContext はユーザー操作の中でしか起こせないブラウザがあるため、初回の入力時に遅延生成する。
const ensureContext = () => {
  if (audioContext) return audioContext
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  audioContext = new Ctor()
  return audioContext
}

const playTone = (name) => {
  const spec = TONE[name]
  if (!spec) return

  const ctx = ensureContext()
  if (!ctx) return
  if (ctx.state === 'suspended') ctx.resume()

  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()

  oscillator.type = name === 'wrong' ? 'sawtooth' : 'sine'
  oscillator.frequency.value = spec.freq

  // 立ち上がり/減衰を付けないとクリックノイズが乗る。
  const now = ctx.currentTime
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(spec.gain, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration)

  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(now)
  oscillator.stop(now + spec.duration + 0.02)
}
