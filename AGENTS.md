# Poora Teeka - AI Agent Guidelines & Project Context

## What this is
Poora Teeka: a dose-completion and vial-batching system for anti-rabies clinics in India. Built for a 4-day AWS hackathon (WeMakeDevs × AWS, September 2026).

## Stack
- **Backend**: Node.js 22, TypeScript, AWS Lambda, API Gateway (HTTP API)
- **Database**: PostgreSQL 16 on RDS, accessed via `pg` (node-postgres), raw SQL (no ORM — the schema's constraints are the point, keep queries explicit)
- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS, deployed on Amplify
- **Infra**: AWS CDK (TypeScript), region `ap-south-1`
- **Scheduling**: EventBridge Scheduler (one-time schedule per dose reminder)
- **Async**: SQS + DLQ, fed by a transactional outbox table
- **Messaging**: WhatsApp Cloud API + Amazon Polly for Hindi/Marathi voice notes

## Hard rules for any code you write
1. **The software NEVER makes clinical decisions.** Staff choose exposure category and protocol. The system only schedules, reminds, and tracks inventory.
2. **A course's route (ID or IM) is fixed at creation and can never change.**
3. **An opened vial's `units_used` must never exceed `units_total`** — enforce with a CHECK constraint, not just application logic.
4. **Any database write that also needs to trigger a side effect (a reminder, a schedule) must use the outbox pattern**: write the outbox row in the SAME transaction as the state change, never call an external service directly from inside a request handler.
5. **Every mutating API call accepts an `Idempotency-Key` header.**
6. **No real patient data, ever.** Synthetic/seed data only.
7. **Prefer explicit, readable SQL over clever one-liners.** This project's whole argument is that the database enforces correctness — the queries should be easy to read and defend, including out loud to a judge.

## Repo Structure
```
poora-teeka/
├── infra/          ← the CDK app: describes every AWS resource
├── api/            ← the Lambda functions (TypeScript)
├── web/            ← the Next.js dashboard
├── db/             ← SQL schema, migrations, seed scripts
├── docs/           ← architecture diagram, screenshots for the README
├── README.md
├── DECISIONS.md    ← running log, one line per real decision
├── .gitignore
└── LICENSE
```

## Current status
- Monorepo scaffolded: `infra/`, `web/`, `api/`, `db/`, `docs/`.
