# Project Memory

## Core
AgentFlow SaaS — WhatsApp AI agents via Evolution API. Primary #25D366 (WhatsApp green), dark mode default.
Inter font. React 18 + TS + Tailwind + shadcn/ui. Supabase backend (Cloud). Portuguese-BR interface.
Zustand for state. All enums as Postgres types. RLS on all tables, user_id scoped.
Devices are the central entity for Evolution API connections. Agents reference devices via device_id.

## Memories
- [DB Schema](mem://features/db-schema) — All tables: profiles, agents, agent_config, devices, conversations, messages, blast_campaigns, blast_contacts, simulator_shares
- [Agent Wizard](mem://features/agent-wizard) — 6-step wizard: type/device, identity, message, qualification, objections/followup/anti-ban, transfer/LLM
- [Prompt Engine](mem://features/prompt-engine) — compileAgentPrompt() in src/lib/compilePrompt.ts, templates for receptive and prospecting
- [Devices Module](mem://features/devices) — Centralized Evolution API connections, device_id isolation in all edge functions
