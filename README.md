# Dash5 - Heavy Equipment Diagnostic Assistant

Dash5 is an AI-powered diagnostic assistant built to help heavy equipment technicians find technical guidance faster and reduce troubleshooting time in the field.

Live app: [dash5.my.id](https://dash5.my.id)

## Overview

Dash5 supports model-aware technical assistance for heavy equipment diagnostics. It helps technicians review symptoms, fault codes, service procedures, parts references, and maintenance information using available technical documentation.

## Key Capabilities

- Technical troubleshooting support for heavy equipment issues.
- Fault code and symptom analysis.
- Model-aware answers based on selected equipment.
- Photo-assisted fault code reading from monitor screens.
- Parts and service reference support when data is available.
- Chat-based workflow for field technicians.

## Tech Stack

- Frontend: React, TypeScript, and Vite.
- UI: Tailwind CSS, Lucide icons, and Motion.
- PWA: Vite PWA with Workbox runtime caching.
- AI: Google Vertex AI with Gemini models.
- Data: Supabase for authentication, chat storage, and technical reference search.
- Backend: Node.js and Express proxy service.
- Deployment: Cloudflare static hosting and Google Cloud Run.

## Project Status

Dash5 is intended for internal technical support workflows. Important repair decisions should still be verified against official manuals, service bulletins, and company procedures.
