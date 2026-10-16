// Zero-dependency static server for offline play.  node tools/serve.mjs [--open] [port]
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const wantOpen = args.includes('--open')
let port = Number(args.find(a => /^\d+$/.test(a)) || process.env.PORT || 8080)
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost')
  let path = normalize(join(root, decodeURIComponent(pathname)))
  if (
    !path.startsWith(root.endsWith(sep) ? root : root + sep) &&
    path !== root
  ) {
    res.writeHead(403).end()
    return
  }
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html')
    const body = await readFile(path)
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    })
    res.end(body)
  } catch {
    res
      .writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      .end('Not found')
  }
})

server.on('error', err => {
  if (err.code === 'EADDRINUSE' && port < 8100) {
    port++
    server.listen(port, '127.0.0.1')
    return
  }
  console.error(err.message)
  process.exit(1)
})
server.on('listening', () => {
  const url = `http://localhost:${port}`
  console.log(`Tesla Roadster Sim is running at ${url}  (press Ctrl+C to stop)`)
  if (wantOpen) {
    const cmd =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open'
    const cmdArgs =
      process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true })
      .on('error', () => {})
      .unref()
  }
})
server.listen(port, '127.0.0.1')
