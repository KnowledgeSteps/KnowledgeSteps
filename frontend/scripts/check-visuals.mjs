import { readdir, readFile } from 'node:fs/promises'
const root = new URL('../src/', import.meta.url)
const failures = []
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
    if (entry.isDirectory()) { await check(file); continue }
    if (!/\.(css|tsx)$/.test(entry.name)) continue
    const text = await readFile(file, 'utf8')
    const rules = [
      [/#[0-9a-f]{3,8}\b/i, 'Use theme tokens instead of hardcoded colors'],
      [/(?:linear|radial|conic)-gradient\(/i, 'Gradients are not part of the visual system'],
      [/<(?:button|input|select|textarea)\b/, 'Use Ant Design controls'],
    ]
    for (const [pattern, message] of rules) {
      if (message.startsWith('Gradients') && file.pathname.endsWith('/design/loading.css')) continue
      if (message.startsWith('Gradients') && file.pathname.endsWith('/design/patterns.css') && !pattern.test(text.replaceAll('repeating-radial-gradient(', 'pattern('))) continue
      if (pattern.test(text)) failures.push(`${file.pathname}: ${message}`)
    }
  }
}
await check(root)
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1 }
else console.log('Visual conventions passed')
