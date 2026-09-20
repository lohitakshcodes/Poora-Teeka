# Decisions log

- 2026-09-17: Chose Postgres over DynamoDB — the product's core value is constraints (vial capacity, no route-switching), and Postgres enforces those at the database level.
- 2026-09-17: Region is ap-south-1 (Mumbai) — data residency for Indian patients, and AWS's India SMS local routes only work from Mumbai/Hyderabad.
- 2026-09-18: Scaffolded monorepo structure (`infra/`, `web/`, `api/`, `db/`, `docs/`) with CDK v2 (TypeScript), Next.js App Router (Tailwind CSS), and Node.js 22 Lambda configuration.
- 2026-09-18: Implemented frontend API layer (`apiFetch` with mock dispatcher, 400-700ms latency simulation, 409 conflict simulation, and synthetic Indian clinical contracts).
- 2026-09-18: Implemented shared frontend design system (`globals.css` palette tokens, `tailwind.config.ts`, 12 core components matching five-moment motion budget, `(clinic)` route group navigation shell with desktop sidebar / mobile tab bar, and standalone `/` and `/s/[token]` routes).
- 2026-09-18: Implemented Register screen at `/app/register` with two-step patient enrollment and course generation (`POST /patients` -> `POST /courses`), ID/IM protocol cards, interactive live dose calendar display, and validation.
- 2026-09-19: Implemented Plan screen at `/app/plan` with live tomorrow batching query (`GET /plan/tomorrow`), top SavingsCounter with count-up animation and waste reduction metrics, and Grouped Time Slot timeline with mapped vials.
