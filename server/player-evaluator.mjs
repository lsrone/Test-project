import { Script } from 'node:vm'

// Only YouTube.js-extracted player functions run here, with no host objects,
// process, require, filesystem or network bindings. Dynamic code is disabled.
export function evaluatePlayerScript(data) {
  if (typeof data?.output !== 'string' || data.output.length > 1_000_000)
    throw new Error('Unsupported player script')
  const script = new Script(`JSON.stringify((function(){${data.output}\n})())`)
  const text = script.runInNewContext(Object.create(null), {
    timeout: 1500,
    contextCodeGeneration: { strings: false, wasm: false },
    microtaskMode: 'afterEvaluate',
  })
  const result = JSON.parse(text)
  return {
    ...(typeof result?.n === 'string' ? { n: result.n } : {}),
    ...(typeof result?.sig === 'string' ? { sig: result.sig } : {}),
  }
}
