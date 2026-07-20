// Worker-isolated jq-wasm runner. The WASM module runs jq synchronously
// inside its async wrapper, so a hostile or buggy filter (`def f: f|f; f`,
// `[range(infinite)]`, etc.) would hang the Node main thread and freeze
// every other MCP tool. Running jq inside a worker_threads worker lets us:
//
//   - terminate() the worker on timeout — the only way to interrupt
//     synchronous WASM execution from outside
//   - cap output bytes in the worker before posting back, so a cheap
//     `[range(0; 100000000)]` filter can't OOM the parent
//
// The worker is lazy + singleton + reused across calls (WASM cold-start is
// ~hundreds of ms; we don't want to pay that per query). On timeout we
// terminate the worker and null the singleton so the next call spawns a
// fresh one — that pending request was unrecoverable anyway.

import { Worker } from 'node:worker_threads';

export interface JqResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const JQ_TIMEOUT_MS = 5_000;
export const JQ_MAX_OUTPUT_BYTES = 5_000_000;

// Resolve jq-wasm from THIS module's location, not the worker's. Eval
// workers resolve bare specifiers against the process cwd, so an installed
// copy of this server (npx/global) would fail with "Cannot find package
// 'jq-wasm' imported from /[worker eval]" whenever the MCP client launches
// it from a directory without jq-wasm in scope. import.meta.resolve walks
// up from this file, which always sits next to its own node_modules.
const JQ_WASM_URL = import.meta.resolve('jq-wasm');

// CJS-style eval worker. `require` works in eval workers; dynamic `import()`
// of an ESM-only package (jq-wasm) is supported in Node ≥18.
const WORKER_SOURCE = `
const { parentPort } = require('worker_threads');
const MAX_OUTPUT = ${JQ_MAX_OUTPUT_BYTES};
let jqRaw = null;

async function loadJq() {
  if (jqRaw) return jqRaw;
  const mod = await import(${JSON.stringify(JQ_WASM_URL)});
  const src = (mod && (mod.raw || mod.json)) ? mod : (mod && mod.default ? mod.default : null);
  if (!src || typeof src.raw !== 'function') {
    throw new Error('jq-wasm module is missing expected raw export');
  }
  jqRaw = src.raw;
  return jqRaw;
}

parentPort.on('message', async (msg) => {
  const { id, input, filter } = msg;
  try {
    const raw = await loadJq();
    const r = await raw(input, filter, ['-c']);
    const stdout = typeof r.stdout === 'string' ? r.stdout : '';
    if (Buffer.byteLength(stdout, 'utf8') > MAX_OUTPUT) {
      parentPort.postMessage({
        id,
        ok: false,
        error: 'jq result exceeds ' + MAX_OUTPUT + ' bytes; narrow your filter (e.g. limit(50; ...), .[:50], or | length)',
      });
      return;
    }
    parentPort.postMessage({
      id,
      ok: true,
      stdout,
      stderr: typeof r.stderr === 'string' ? r.stderr : '',
      exitCode: typeof r.exitCode === 'number' ? r.exitCode : 0,
    });
  } catch (e) {
    parentPort.postMessage({
      id,
      ok: false,
      error: (e && e.message) ? e.message : String(e),
    });
  }
});
`;

interface PendingReq {
  resolve: (r: JqResult) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

interface WorkerRef {
  worker: Worker;
  pending: Map<string, PendingReq>;
}

let workerRef: WorkerRef | null = null;
let seq = 0;

function rejectAllPending(ref: WorkerRef, err: Error): void {
  for (const p of ref.pending.values()) {
    clearTimeout(p.timer);
    p.reject(err);
  }
  ref.pending.clear();
}

function getWorker(): WorkerRef {
  if (workerRef) return workerRef;
  const worker = new Worker(WORKER_SOURCE, { eval: true });
  const ref: WorkerRef = { worker, pending: new Map() };
  worker.on('message', (m: { id: string; ok: boolean; stdout?: string; stderr?: string; exitCode?: number; error?: string }) => {
    const p = ref.pending.get(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    ref.pending.delete(m.id);
    if (m.ok) {
      p.resolve({ stdout: m.stdout ?? '', stderr: m.stderr ?? '', exitCode: m.exitCode ?? 0 });
    } else {
      p.reject(new Error(m.error ?? 'jq worker error'));
    }
  });
  worker.on('error', (err) => {
    rejectAllPending(ref, err instanceof Error ? err : new Error(String(err)));
    if (workerRef === ref) workerRef = null;
  });
  worker.on('exit', (code) => {
    rejectAllPending(ref, new Error(`jq worker exited (code ${code})`));
    if (workerRef === ref) workerRef = null;
  });
  // Don't block process exit on the worker — stdio servers should be
  // terminable cleanly even while a worker is idle.
  worker.unref();
  workerRef = ref;
  return ref;
}

/**
 * Run a jq filter against `input` in the worker, with a hard timeout and
 * output cap. Throws on timeout, abort, or jq worker failure.
 */
export async function runJq(
  input: string,
  filter: string,
  signal?: AbortSignal,
): Promise<JqResult> {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error('aborted');
  }
  const ref = getWorker();
  const id = `${++seq}`;
  return new Promise<JqResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      ref.pending.delete(id);
      // Synchronous WASM can't be interrupted any other way; the worker is
      // unrecoverable for THIS request, so kill it and let the next call
      // spawn a fresh one.
      ref.worker.terminate().catch(() => {});
      if (workerRef === ref) workerRef = null;
      reject(new Error(`jq filter timed out after ${JQ_TIMEOUT_MS}ms`));
    }, JQ_TIMEOUT_MS);

    const onAbort = (): void => {
      if (!ref.pending.has(id)) return;
      ref.pending.delete(id);
      clearTimeout(timer);
      // Same reasoning as timeout: a request that's mid-WASM can't be
      // cancelled gracefully. Kill the worker.
      ref.worker.terminate().catch(() => {});
      if (workerRef === ref) workerRef = null;
      reject(signal?.reason instanceof Error ? signal.reason : new Error('aborted'));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    ref.pending.set(id, { resolve, reject, timer });
    ref.worker.postMessage({ id, input, filter });
  });
}

// Test-only: tear down the worker singleton between test cases so worker
// state (e.g. cached jq module) doesn't leak.
export async function _resetJqWorker(): Promise<void> {
  const ref = workerRef;
  workerRef = null;
  if (!ref) return;
  rejectAllPending(ref, new Error('worker reset'));
  await ref.worker.terminate().catch(() => {});
}
