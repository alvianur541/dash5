// Test-only bundle entry: exposes internals the runtime bundle keeps private.
export { callProxyStream, STREAM_HALT_NOTE, STREAM_CUT_NOTE, SERVICE_INTERVAL_RE, extractCpmPartsForInterval } from '../src/orchestrator';
export { runWithDeps } from '../src/deps';
