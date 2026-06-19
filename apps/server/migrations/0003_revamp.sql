-- apps/server/migrations/0003_revamp.sql — revamp: keeper flag + credit guardrail.
-- Runs AFTER 0002_init.sql (the badges table). (a) badges.keeper marks at most one
-- ready badge per (user, race) as the "hero"; (b) credits is a per-user soft
-- guardrail (ADR-0016), keyed by "user".id — reserved → quoted, cascade-deleted.
alter table badges add column keeper boolean not null default false;

create table credits (
  user_id text primary key references "user"(id) on delete cascade, -- owner; "user" is reserved → quoted
  balance int  not null default 20                                  -- starting generation allowance
);
