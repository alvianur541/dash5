# Dash5 diagram prototype

Isolated test artifact: no chat route, production endpoint, deployment, DB change, tldraw or new dependency. The browser artifact is fully offline. **Render JSON is not a live model button.**

## Test immediately

Open `dash5-diagram-test.html` in Chrome/Edge/Safari. It embeds the genuinely generated `generated-example.json`, not a handwritten mock. Edit node labels or edges, click **Render JSON**, zoom/pan, and export SVG/JSON. Invalid JSON clears the diagram and disables SVG export. Sources must remain empty in this demo. Mobile browsers may require downloading the HTML and opening it in a browser rather than the messenger preview.

## Generate another diagram (authenticated local operator only)

Install the existing backend dependencies (`npm --prefix cloudrun ci`) and use existing Application Default Credentials with Vertex permission. Never put a token in the browser.

```sh
GOOGLE_CLOUD_PROJECT=project-85bfc388-3106-4361-a9f \
  node prototype/diagram/generate.cjs prototype/diagram/example-input.txt /path/to/result.json
node prototype/diagram/build.cjs /path/to/result.json /path/to/test.html prototype/diagram/example-input.txt
node --test prototype/diagram/core.test.cjs
```

Replace the input path in **both commands** when testing your own text. A generation makes one request, no hedge/retry, maximum 4096 output tokens, 60-second fetch timeout; defaults to the backend's currently used `gemini-3.7-flash`, overridable by `VERTEX_MODEL`. Reuses `cloudrun/server/upstream.js` for authenticated Vertex resolution. CLI is intentionally not exposed through HTTP, avoiding an open billable endpoint.

## Algorithm and safety

1. Gemini returns a response-schema-constrained JSON object (title, nodes, edges, sources).
2. Server-side `validate` caps serialized size at 40,000 characters, 40 nodes, 80 edges, validates IDs/uniqueness, allowed shapes, label lengths and actual edge endpoints. Unknown properties are stripped; no HTML, JavaScript or arbitrary Mermaid execution.
3. Sources are checked **separately** against caller-provided, actually retrieved IDs. This generator performs no retrieval and passes an empty whitelist. A valid structure does not establish technical accuracy or document grounding.
4. Deterministic breadth-first ordering with a visited set handles branches, disconnected nodes, cycles and self-loops. Each node occupies a separate row; successive single-path steps use central connectors, other edges get distinct orthogonal exterior lanes. Nodes never overlap. Connectors can cross and this simple lane layout gets wide on large graphs; it is not an optimized electrical/hydraulic schematic layout engine.
5. Escaped SVG labels, title, attributes and edge labels. Frontend renders only the validated renderer output; full-sized SVG export is independent of display zoom.

**Safety limitation:** illustrative troubleshooting only. The generic lamp example is self-authored, nonconfidential test text, not an official manual. Semantic faithfulness still needs review; source whitelisting alone is not claim-level proof. Manual retrieval, source-to-node evidence, production auth integration, PNG export and in-chat controls are outside this prototype.

## Exercised evidence

- One genuine Vertex call: STOP completion, 8 nodes / 9 edges, sources empty, 542 input / 626 output / 1168 total tokens (provider metadata saved with fixture).
- RED → GREEN: acceptance first failed `Not implemented`; layout/SVG tests failed for absent functions, then passed. Ten core tests cover invalid endpoints, duplicate IDs, unsupported shapes, limits, fabricated references, deterministic branches/cycles/self-loops, orthogonal paths and escaped XSS.
- Headless Chromium desktop/mobile: real fixture rendering, zoom, successful SVG download, malformed JSON clearing canvas, injected HTML remaining inert, cycle rendering, no horizontal page overflow and no page errors. Initial mobile overflow was found and fixed; rerun passed.
- Required gates: frontend typecheck, lint and build; backend npm test passed. Existing backend tests print expected simulated errors. Build reports an existing empty supabase chunk.

Assumptions: operator already has authorized Vertex credentials; generic test input is safe to send; no model accuracy claims. Risk: incorrect LLM ordering/content can still pass structural validation, diagram size grows with branches. Rollback: discard this branch; all code lives under `prototype/diagram/`, existing application files untouched. Do not merge/deploy without owner approval.
