-- apps/server/migrations/0002_init.sql — badges table.
-- Runs AFTER 0001_auth.sql (the committed Better Auth schema) so the user_id FK
-- to "user" resolves. gen_random_uuid() is core in PG13+. "user" is reserved → quoted.
create type badge_status    as enum ('generating','ready','failed');
create type badge_error_tag as enum ('GenTimeout','InvalidPrompt','BrokenResponse'); -- 1:1 with the Effect errors

create table badges (
  id            uuid primary key default gen_random_uuid(),
  inputs        jsonb        not null,          -- full BadgeInputs: source of truth for re-typeset + re-gen
  built_prompt  text         not null,          -- exact deterministic string sent to the model (demo gold)
  provider      text         not null default 'pending', -- 'pending' until ready, then 'cloudflare' | 'pollinations'
  seed          bigint       not null,          -- reused for "keep seed"
  image_key     text,                           -- Garage key emblems/<id>.jpg; null until ready
  status        badge_status not null default 'generating',
  error_tag     badge_error_tag,                -- null unless status='failed'
  user_id       text         not null references "user"(id), -- owner; "user" is reserved → quoted
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now()
);
create index badges_created_at_idx    on badges (created_at desc);
create index badges_ready_created_idx on badges (created_at desc) where status = 'ready';
create index badges_user_id_idx       on badges (user_id);
