// Test-only bundle entry: exposes internals the runtime bundle keeps private.
export { callProxyStream, STREAM_HALT_NOTE, STREAM_CUT_NOTE, SERVICE_INTERVAL_RE, extractCpmPartsForInterval, detectFaultCodeInQuery } from '../src/orchestrator';
export { extractPartNumber, isPartsQuery, extractSearchTerms } from '../src/rag';
export { runWithDeps } from '../src/deps';
