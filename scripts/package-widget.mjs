// Packages the built widget (app/ + plugin-manifest.json) into dist/*.zip for Zoho Creator → Settings → Widgets.
// Same flow as the Cost Analysis widget's `npm run pack`: delete .DS_Store, then `zet pack` (Zoho Extension Toolkit).
// Without zet on the machine, a zip with the identical layout is written instead.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}
if (!existsSync('app/widget.html')) fail('app/widget.html not found — the Vite build did not run')
if (!existsSync('plugin-manifest.json')) fail('plugin-manifest.json not found')

const removeDsStore = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (name === '.DS_Store') rmSync(p)
    else if (statSync(p).isDirectory()) removeDsStore(p)
  }
}
removeDsStore('app')
rmSync('dist', { recursive: true, force: true }) // only the latest package is kept

const zet = spawnSync('zet', ['pack'], { stdio: 'inherit' })
if (zet.error?.code === 'ENOENT') {
  console.warn('zet not found (npm install -g zoho-extension-toolkit) — writing the zip with the same layout instead')
  const name = JSON.parse(execFileSync('node', ['-p', 'JSON.stringify(require("./package.json").name)']).toString())
  execFileSync('mkdir', ['-p', 'dist'])
  execFileSync('zip', ['-qr', `dist/${name}.zip`, 'plugin-manifest.json', 'app'], { stdio: 'inherit' })
} else if (zet.status !== 0) {
  fail('zet pack failed')
}

const zips = existsSync('dist') ? readdirSync('dist').filter((f) => f.endsWith('.zip')) : []
if (!zips.length) fail('no zip was written to dist/')
for (const z of zips) console.log(`✓ Widget package: dist/${z}  (upload in Creator → Settings → Widgets; index file /app/widget.html)`)
