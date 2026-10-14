/**
 * WattBot's door into the simulator (watt-wattbot-worker → deep mode): one
 * JSON request on stdin, one JSON answer on stdout. See api.ts.
 *
 *   {"op": "recommend", "args": {...}}
 *   {"op": "duct_location", "args": {...}}
 */
import { OPS, type Args } from './api'

async function main() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  try {
    const req = JSON.parse(raw || '{}') as { op?: string; args?: Args }
    const fn = OPS[req.op ?? '']
    if (!fn) throw new Error(`unknown op ${req.op} — one of ${Object.keys(OPS).join(', ')}`)
    process.stdout.write(JSON.stringify(fn(req.args ?? {})))
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
  }
}

if (process.argv[1] && /cli\.(m?js|ts)$/.test(process.argv[1])) void main()
