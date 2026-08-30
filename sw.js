// オフラインで動かすための Service Worker。
//
// __BUILD_ID__ は tools/build.mjs が「畳んだ HTML のハッシュ」に置き換える。
// 中身が変われば ID も変わり = キャッシュ名が変わる = 古いキャッシュが捨てられる。
// ここを固定文字列のままにすると、直しても古い版が出続ける。
//
// 取り方は stale-while-revalidate:
//   キャッシュがあれば即返し、裏で取り直して次回の起動を新しくする。
//   毎回ネットを待たないので、電車の中でも成績が出るまで固まらない。
//
// 配るのは dist/ の中身だけ。ここに書く名前は必ず dist に存在すること
// (tools/verify-bundle.mjs が実在を検査している)。

const BUILD_ID = '__BUILD_ID__'
const CACHE = `poker-range-trainer-${BUILD_ID}`

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  // GET 以外と他オリジンは触らない (触ると壊れるだけで得がない)
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request).then((hit) => {
        const fresh = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone())
            return response
          })
          // オフライン。キャッシュがあればそれ、無ければ失敗をそのまま返す
          .catch(() => hit)

        return hit || fresh
      }),
    ),
  )
})
