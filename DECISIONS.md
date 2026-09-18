# Decisions log

- 2026-09-17: Chose Postgres over DynamoDB — the product's core value is constraints (vial capacity, no route-switching), and Postgres enforces those at the database level.
- 2026-09-17: Region is ap-south-1 (Mumbai) — data residency for Indian patients, and AWS's India SMS local routes only work from Mumbai/Hyderabad.
- 2026-09-18: Scaffolded monorepo structure (`infra/`, `web/`, `api/`, `db/`, `docs/`) with CDK v2 (TypeScript), Next.js App Router (Tailwind CSS), and Node.js 22 Lambda configuration.
