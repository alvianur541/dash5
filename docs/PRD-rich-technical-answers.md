# PRD — Rich Technical Answers for Dash5 Mobile

**Status:** Draft for product approval  
**Owner:** Alvianur  
**Product:** Hexindo Technical Assistant (Dash5)  
**Primary surface:** Mobile chat at `app.dash5.id`  
**Decision:** Adopt the approved visual direction for technical answer content; preserve the existing app shell.

## 1. Problem

Dash5 currently renders assistant answers primarily as Markdown. The format is reliable for general explanations, tables, fault-code guidance, and streaming, but important technical facts can be slow to scan on a phone.

Technicians often need one dominant value, one source, or a short action sequence while working beside a machine. In those situations, a paragraph-first answer increases reading time and makes critical context—unit, condition, source, and revision—too easy to miss.

The approved mobile concept improves this by presenting selected answers as purpose-built technical blocks:

- a dominant specification value such as torque or pressure;
- a Technical News or bulletin summary;
- a compact procedure summary with ordered steps and values.

The existing top bar, user bubbles, chat flow, composer, dark/light themes, streaming behavior, and navigation should remain unchanged.

## 2. Goals

1. Make high-confidence technical facts readable within two seconds on a mobile screen.
2. Preserve the selected unit, source provenance, conditions, and revision beside the displayed fact.
3. Add rich answer blocks without weakening the existing Markdown fallback.
4. Keep the first streamed text as fast as today; rich formatting may appear only after the final answer is validated.
5. Persist rich blocks in local and Supabase chat history so the same answer survives reload and device switching.
6. Support dark/light themes, 320 px screens, iPhone safe areas, 200% text zoom, reduced motion, and screen readers.

## 3. Non-goals

- Redesigning the app shell, sidebar, top bar, composer, login, or navigation.
- Converting every answer into cards.
- Letting the language model emit arbitrary HTML, CSS, or UI component names.
- Inferring cards from unrestricted frontend regex over answer prose.
- Replacing the complete textual answer or its Markdown fallback.
- Adding a new database table in the first release.
- Changing retrieval, ranking, authorization, RLS, pricing, or source selection.
- Rendering web-search claims as authoritative specification cards.

## 4. Target users and context

Primary users are field and workshop technicians using phones in bright, noisy, and sometimes dirty environments. Typical constraints include one-handed use, gloves, intermittent connectivity, small screens, and urgent troubleshooting.

The design must prioritize scanability and certainty over decorative density.

## 5. Approved product direction

### 5.1 Preserve

- Current mobile shell and navigation.
- Centered unit selector.
- Existing user-message bubble behavior.
- Assistant answers placed directly on the chat canvas.
- Current composer, safe-area handling, streaming, stop control, and offline behavior.
- Existing Hexindo dark/light palette.
- Serif typography for long-form explanatory prose.

### 5.2 Add

1. **Specification Card**
   - Primary value and unit.
   - Optional alternative unit/value.
   - Context facts such as bolt size, quantity, measurement condition, or tolerance.
   - Selected machine model.
   - Source title, section, and revision/date when known.

2. **Technical News Card**
   - Bulletin or Technical News identifier.
   - Publication date or revision.
   - Title and affected model.
   - Source action that opens or identifies the originating document when supported.

3. **Procedure Summary**
   - Ordered steps.
   - Optional expected state/value per step.
   - Source and applicable conditions.
   - Stacked mobile layout when labels or values are long.

These components use the existing sans-serif UI font. Narrative explanation remains in the existing serif answer style.

## 6. Safety and provenance rules

A rich block may render only when all required validation succeeds.

1. The block's `unitModel` must equal the immutable selected unit for the request.
2. The source must come from an authorized Dash5 retrieval result available to that request.
3. Specification cards require a source-backed exact value and unit. A model-only claim is insufficient.
4. Web search results may remain in Markdown but cannot create an authoritative specification card.
5. Price values continue to use only the existing Hexindoparts/promo pipeline and are outside this PRD's initial card scope.
6. Every block must include at least one source reference with document ID, category, title, and section when available.
7. Unknown revision, condition, tolerance, or serial applicability must remain visibly unknown; the client must not invent or hide it.
8. The server must reject unsupported block types, oversized arrays, unexpected keys, HTML, scripts, and unapproved URLs.
9. If validation fails, Dash5 renders the complete Markdown answer with no partial card.

## 7. Proposed data contract

The existing `Message.content` remains the complete fallback answer. Assistant messages may additionally carry a versioned presentation payload.

```ts
type PresentationSource = {
  documentId: string;
  title: string;
  category: string;
  section?: string;
  revision?: string;
};

type SpecValueBlock = {
  type: 'spec_value';
  label: string;
  value: string;
  unit: string;
  alternateValues?: Array<{ value: string; unit: string }>;
  facts?: Array<{ label: string; value: string }>;
  unitModel: UnitModel;
  sources: PresentationSource[];
};

type TechnicalNewsBlock = {
  type: 'technical_news';
  bulletinId?: string;
  date?: string;
  title: string;
  affectedModels: UnitModel[];
  sources: PresentationSource[];
};

type ProcedureStepsBlock = {
  type: 'procedure_steps';
  title?: string;
  steps: Array<{ label: string; value?: string }>;
  unitModel: UnitModel;
  conditions?: string[];
  sources: PresentationSource[];
};

type MarkdownBlock = {
  type: 'markdown';
  content: string;
};

type AnswerPresentationV1 = {
  version: 1;
  blocks: Array<
    | SpecValueBlock
    | TechnicalNewsBlock
    | ProcedureStepsBlock
    | MarkdownBlock
  >;
};
```

Limits for V1:

- maximum 8 blocks per answer;
- maximum 1 primary `spec_value` block;
- maximum 12 procedure steps;
- maximum 4 facts per specification card;
- maximum 3 source references per block;
- all strings length-limited and normalized server-side.

## 8. Generation strategy

### 8.1 Required principle

The language model is not the UI contract. Rich blocks must be created or accepted by trusted server code and validated against authorized retrieval evidence.

### 8.2 Phased generation

**Phase 1 — deterministic, narrow:**

- Technical News cards from known document metadata.
- Specification cards only for exact, single-value facts that server code can bind to a retrieved source and selected unit.
- Existing Markdown for everything else.

**Phase 2 — validated procedures:**

- Procedure summaries generated only when ordered source-backed steps can be mapped without dropping warnings or conditions.
- The source text remains available in the fallback answer.

**Deferred:**

- General model-generated cards from arbitrary prose.
- Automatic conversion of every numbered list.
- Rich cards sourced only from external web results.

## 9. Streaming and transport

1. Existing SSE `text`, `agent_event`, `meta`, and `done` behavior remains backward compatible.
2. Text streams exactly as it does today.
3. After the final answer is complete, the backend may send one validated `presentation` SSE frame before `done`.
4. The frontend stores the presentation payload only after receiving the final `meta.full` text and a complete `done` sequence.
5. During streaming, the user sees normal Markdown. Rich blocks appear atomically after final validation.
6. If the stream is interrupted, stopped, malformed, or missing final metadata, no rich presentation is stored.
7. Older clients ignore the unknown frame and still retain the complete textual answer.

## 10. Rendering behavior

- `MessageItem` selects rich rendering only for a valid supported payload.
- A valid payload renders its ordered blocks instead of the fallback Markdown body.
- Invalid or unsupported payloads render `Message.content` unchanged.
- Source labels use semantic links or buttons only when a real action exists; otherwise they remain noninteractive labels.
- Primary technical values use tabular numerals and controlled `clamp()` sizing.
- Values and units must wrap safely at 320 px and 200% text zoom.
- Procedure rows stack vertically below the mobile breakpoint when either side becomes long.
- Color is never the only indicator of source, state, or action.
- No layout shift animation is required when rich blocks replace the final streamed Markdown.

## 11. Accessibility requirements

- Body text and secondary labels meet WCAG AA contrast in both themes.
- Interactive targets are at least 44 × 44 CSS px on mobile.
- Specification cards use semantic headings and `<dl>/<dt>/<dd>`.
- Procedures use `<ol>` with meaningful labels.
- Source controls have explicit accessible names.
- Units have readable accessible text where visual abbreviations are ambiguous.
- Rich blocks support keyboard focus, screen readers, reduced motion, and text zoom.
- Missing context is expressed in text, not only through muted color.

## 12. Authorization and data boundary

- Rich presentation is produced inside the existing authenticated `/v1/ask` request.
- It uses the same request-scoped user identity, unit, RLS, retrieval scope, and source allow-list as the textual answer.
- Presentation payloads are display metadata, not a new retrieval channel.
- The frontend cannot request arbitrary document IDs or broaden access by editing a presentation object.
- Chat history continues to use existing local storage and `chat_sessions.messages` JSON storage.
- No new secret, public endpoint, IAM permission, or database policy is introduced.

## 13. Rollout

1. Add schema, parser, validators, and fixtures behind `RICH_ANSWERS_ENABLED=false`.
2. Add frontend components with fixture-only visual tests.
3. Enable for owner account or development builds only.
4. Validate on 320 px, 390 px, and desktop in dark/light themes.
5. Validate real iPhone PWA behavior, text zoom, keyboard, reload, and history synchronization.
6. Enable only `technical_news` blocks first.
7. Enable exact `spec_value` blocks after source-binding evaluation passes.
8. Enable `procedure_steps` last.
9. Rollback by disabling the feature flag; Markdown remains complete and requires no data migration.

## 14. Metrics

- Rich-block validation success rate by block type.
- Fallback rate and fallback reason.
- Rendering/schema errors.
- Time from final text to rich presentation.
- Answer feedback rate for rich versus plain answers.
- Source-open action rate when a real source action is available.
- Percentage of rich blocks with complete unit, section, and revision metadata.
- No increase in first-token latency.
- No increase in unauthorized document access or client-visible raw metadata.

## 15. Evaluation set

The implementation must use real, source-grounded fixtures covering:

- torque with primary and alternative units;
- pressure with tolerance and conditions;
- fluid capacity;
- a Technical News item with and without revision metadata;
- a short procedure with expected values;
- a long bilingual procedure;
- conflicting values from two documents;
- missing section/revision;
- external web result;
- wrong-unit source candidate;
- interrupted stream;
- unsupported payload version;
- history reload from local storage and Supabase.

Each fixture must prove the old implementation fails to provide the required structured behavior before production code is added.

## 16. Acceptance criteria

1. Plain Markdown answers remain byte-for-byte available as fallback.
2. Unsupported, malformed, incomplete, wrong-unit, or unauthorized blocks never render.
3. A rich answer persists and renders identically after reload and cross-device history fetch.
4. First-token latency does not regress by more than measurement noise because presentation is post-final.
5. Cards do not overflow at 320 px, 390 px, desktop, or 200% text zoom.
6. Dark/light contrast meets WCAG AA for text and controls.
7. Interactive targets meet the 44 px mobile minimum.
8. Screen-reader output preserves value, unit, condition, order, and source.
9. Streaming, stop, retry, offline, bookmark, and table-image behavior remain functional.
10. Feature flag rollback restores the existing Markdown presentation without a deploy-time data migration.
11. Frontend test, lint, typecheck, build, backend test, and production health gates pass before rollout.
12. Physical iPhone PWA screenshots confirm the final spacing and safe-area behavior before broad enablement.

## 17. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Incorrect value becomes visually authoritative | High | Exact source binding, selected-unit validation, fallback on any mismatch |
| Prompt output treated as UI schema | High | Server-owned typed contract; no arbitrary HTML or frontend prose regex |
| Context or warning lost in summary | High | Conditions are required when applicable; full textual fallback retained |
| Streaming layout shift | Medium | Rich presentation attaches only after final answer; no animated reflow |
| Long values overflow small phones | Medium | `clamp()`, wrapping, stacked breakpoints, 320 px and 200% zoom fixtures |
| Old clients do not understand payload | Low | Complete text remains in `Message.content`; unknown SSE frames are ignored |
| History grows larger | Low | Strict block/string/count limits; no source body copied into payload |
| Visual style drifts from Dash5 | Medium | Reuse existing tokens and shell; sans only inside data blocks |

## 18. Open decisions for approval

1. Whether the first implementation includes only `technical_news`, or both `technical_news` and exact `spec_value`.
2. Whether source labels are informational only in V1 or open an existing source/document view.
3. Whether rich presentation is enabled for Live-generated answers in the first rollout or text chat only.
4. Whether unknown revision should display `Revision not available` or omit the row while showing a general verification note.
5. Whether procedure summaries should wait until source documents have more structured ingestion metadata.

## 19. Recommended V1 decision

Build **Technical News Card + exact Specification Card** for regular text chat only.

Keep Procedure Summary and Live rich rendering disabled until the first two block types prove that source binding, history persistence, mobile layout, and rollback work safely. This gives the approved visual improvement without turning model prose into an unsafe UI contract.
