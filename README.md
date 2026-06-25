# Dash⁵ — Heavy Equipment Diagnostic Assistant

Live app: [dash5.my.id](https://dash5.my.id)

Dash⁵ is a RAG-based (Retrieval-Augmented Generation) AI assistant built to help Hitachi/KCM heavy equipment technicians find technical information faster — fault code diagnosis, component specifications, parts lookup, and maintenance schedules — sourced directly from official manuals, without having to dig through hundreds of pages of PDF documentation by hand.

---

## 1. Background

Field technicians often struggle when troubleshooting heavy equipment: technical documentation (Technical Manual, Workshop Manual, Parts Catalog, Engine Manual) is spread across hundreds of pages per unit model, and manually searching for specific information (fault codes, torque specs, part numbers, maintenance intervals) is time-consuming — especially in the field under time pressure.

Dash⁵ was built to solve this: a single chat interface that retrieves data directly from the official manual knowledge base per unit model, and returns answers grounded in the source documents — not AI guesswork.

## 2. System Goals

- Speed up access to technical information in the field without opening physical/PDF manuals one by one
- Reduce reliance on manual human interpretation when reading fault codes
- Provide accurate, verifiable answers (verbatim quotes from documents, not AI hallucination)
- Support parts/promo price lookup that always reflects the most current active period

## 3. Key Features

### 3.1 AI Chat Assistant
Chat powered by Gemini (Google Vertex AI), context-aware across conversation history, with natural Indonesian phrasing tailored for field technicians (not rigid templated answers).

### 3.2 Document Intelligence (RAG)
Hybrid search (keyword + vector embedding + Cohere rerank) over the knowledge base:
- **Technical/Workshop Manual** — troubleshooting, fault codes, procedures, measurable specs (torque, pressure, weight, clearance, etc.)
- **Parts Catalog & Engine Parts Catalog** — part number lookup, cross-reference
- **CPM (Component Preventive Maintenance)** — mandatory parts replacement schedule by operating-hour interval
- **Promo** — active pricing (automatically prioritizes the newest active promo period, avoiding expired prices)
- **Hydraulic Circuit Diagram** — relief pressure, displacement specs, etc. (select models)

A confidence-tiering system (high/medium/low) determines whether the AI can answer with confidence, must add a verification caveat, or should withhold an answer because the retrieved data isn't relevant enough — preventing the AI from fabricating critical technical information.

### 3.3 Image Understanding (Fault Code OCR)
Upload a photo of the unit's monitor screen → AI (Gemini Vision) reads the displayed fault code(s), then automatically searches the manual for diagnosis and repair procedures — no manual code entry required.

### 3.4 Multi-Aspect Query Decomposition
Queries containing more than one issue at once (e.g. "swing is slow and the pump is leaking, also check the part number") are automatically broken into sub-queries, searched in parallel against the right sources, and merged into a single structured answer.

### 3.5 Agentic Mode (ReAct, opt-in)
Besides the default deterministic routing path, a full ReAct agent mode is available — the AI decides for itself which tool to call (search manual / parts / engine manual / circuit diagram / decompose query) in a reasoning loop of up to 4 iterations before composing the final answer. Enabled via `?agentic=true`.

### 3.6 User Profile & Chat History
Email login (Supabase Auth), with per-user chat session history saved and retrievable.

## 4. System Architecture

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite, Tailwind CSS, PWA (Workbox) |
| AI Engine | Google Vertex AI — Gemini (main model + a lightweight model for intent classification) |
| Vector Database | Supabase (PostgreSQL + pgvector) |
| Reranking | Cohere Rerank |
| Backend Proxy | Node.js + Express (keeps the Vertex AI API key off the client) |
| Auth & Storage | Supabase (auth, chat session storage) |
| Deployment | Cloudflare (static frontend hosting) + Google Cloud Run (backend proxy) |

## 5. How It Works (Question Analysis Flow)

1. The technician selects a unit model, then submits a question, fault code, part request, symptom description, or a monitor screen photo.
2. The system classifies the query type: fault code, parts/maintenance interval, technical/troubleshooting, multi-aspect, or off-topic.
3. If the query contains more than one issue, it's split into independent sub-queries for more precise retrieval.
4. The system searches for the most relevant references for the selected unit model (technical manuals, parts catalogs, service data) using a combination of keyword search, vector search, and reranking.
5. Results are filtered by confidence score — low-relevance data is not passed to the AI, preventing fabricated answers.
6. The AI composes the final answer grounded in the manual data, with an explicit note when data is limited or requires manual verification.

## 6. Key Strengths

- **Anti-hallucination by design** — answers are gated by confidence tiering; irrelevant data is never forced into an answer
- **Always uses the latest pricing** — the promo system automatically prioritizes the newest active period, preventing the AI from quoting expired prices
- **Automatic 2nd-pass lookup** — a fault code found in the Technical Manual automatically triggers a follow-up search in the Engine Manual (DTC P-code) with no extra instruction needed
- **Dual-mode** — fast, stable deterministic routing by default, plus a full agentic (ReAct) path for complex cases
- **Prompt injection defense** — user input is sanitized before being sent to the model

## 7. Project Status

Dash⁵ is intended to support internal technical support workflows. Critical repair decisions should still be verified against official manuals, service bulletins, and company procedures — Dash⁵ is a search assistant, not a substitute for final technical judgment.
