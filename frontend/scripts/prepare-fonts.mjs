// Original Chillax files come directly from Fontshare; do not redistribute in Git.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const fonts = [
  {
    "file": "Chillax-400.woff2",
    "url": "https://cdn.fontshare.com/wf/WSPWZKQM26GGKSLVGSP2CFUHUMS5BCYQ/UE3YJANJM3SE3IWT4TOMYQVMLCQ6GZGG/XESIRBQU62YFBC7YQZI6D2NT5CNZ4PPU.woff2",
    "sha256": "bfdbe99248dd6c6bcbf3f227987c2ee7989741cb7ef300de5061b3bf62ad3281"
  },
  {
    "file": "Chillax-500.woff2",
    "url": "https://cdn.fontshare.com/wf/XASL35KKT35X3ACCBCOQKKABSR6AT3FX/6MU5BWUUPHCFUHM2F3E3QPQGKXCVBUOO/WZY5PMNTII6NKOB2TTIAX7QVAWMSY2DQ.woff2",
    "sha256": "66011a95eed59e55eed49fc75a3aac277d4c42e5b3040ff55ea559588051daba"
  },
  {
    "file": "Chillax-600.woff2",
    "url": "https://cdn.fontshare.com/wf/2T24MWUOKZU65SZJ33GPRGNOKE4KPOBX/T6LIXZJIPB23UDPMTIKURYWSZLXZBJ3A/THF5L6EHVL4N4NNE3GYDZNZSHABL5CH5.woff2",
    "sha256": "974d6085abacf1cb806922482efd026256d3d64b708e5c095559c1dd62f18f56"
  },
  {
    "file": "Chillax-700.woff2",
    "url": "https://cdn.fontshare.com/wf/UM553GIXLG5E46TUH763VYPGAQ77BPQ5/NN4EI53RUGC4BO5HP5F46SYQ4WY4U4CE/T2KA2X72VGASVXFVB7QCOIFYVH5GZJTW.woff2",
    "sha256": "e3a8687e3cd4adfaee574d16926d86c40fde96834e87cd3fe297a52698e4cddf"
  }
]
const directory = new URL('../public/fonts/', import.meta.url)
await mkdir(directory, { recursive: true })
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
for (const font of fonts) {
  const destination = new URL(font.file, directory)
  const existing = await readFile(destination).catch(() => null)
  if (existing && hash(existing) === font.sha256) continue
  const response = await fetch(font.url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`Fontshare download failed: ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (hash(bytes) !== font.sha256) throw new Error(`Font checksum mismatch: ${font.file}`)
  await writeFile(destination, bytes)
  console.log(`Prepared ${font.file}`)
}
