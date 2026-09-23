-- Табель: данные сайта в базе.
-- RLS включается в той же миграции, что и таблица: оценки самочувствия и утро — записи о здоровье,
-- их видит и меняет только владелец. Правила, которые база держит сама (решение Georgy 23.09):
-- оценки 0–10, одно начало дня и неизменное утро, замок правил челленджа. Пауза, возврат из корзины и
-- порядок считаются функциями домена на клиенте (src/domain/challenges.ts).

-- ---------- челленджи ----------

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  code text not null check (btrim(code) <> ''),
  kind text not null check (kind in ('do', 'quit')),
  measure text not null check (measure in ('binary', 'count')),
  goal numeric not null check (goal > 0),
  unit text,
  color text not null,
  -- теги челленджа; удаление тега снимает его отсюда (триггер tags_detach ниже)
  tag_ids uuid[] not null default '{}',
  start_date date not null,
  -- null — бессрочный
  length_days integer check (length_days > 0),
  -- периоды паузы [{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" | null }], считает домен
  pauses jsonb not null default '[]'::jsonb check (jsonb_typeof(pauses) = 'array'),
  rules_locked boolean not null default false,
  -- мягкое удаление: челлендж в корзине, отметки и статистика на месте
  deleted_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  -- для составной ссылки из entries: отметка — только к своему челленджу
  unique (id, user_id)
);
create index challenges_user_idx on public.challenges (user_id);

alter table public.challenges enable row level security;
create policy "challenges: только свои" on public.challenges
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Замок закрывает только правила (тип, измерение, цель, единица, срок) и не снимается.
create function public.challenges_keep_lock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.rules_locked then
    if not new.rules_locked then
      raise exception 'Замок правил челленджа не снимается' using errcode = 'check_violation';
    end if;
    if (new.kind, new.measure, new.goal, new.unit, new.length_days)
       is distinct from (old.kind, old.measure, old.goal, old.unit, old.length_days) then
      raise exception 'Правила челленджа под замком не меняются' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger challenges_keep_lock before update on public.challenges
  for each row execute function public.challenges_keep_lock();

-- ---------- отметки ----------

create table public.entries (
  challenge_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  -- «не отмечено» — нет строки; у отказа 0 — срыв
  value numeric not null check (value >= 0),
  primary key (challenge_id, day),
  -- окончательное удаление челленджа уносит его отметки
  foreign key (challenge_id, user_id) references public.challenges (id, user_id) on delete cascade
);
create index entries_user_idx on public.entries (user_id);

alter table public.entries enable row level security;
create policy "entries: только свои" on public.entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- теги челленджей ----------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (name = btrim(name) and name <> ''),
  created_at timestamptz not null default now()
);
-- дубль без учёта регистра
create unique index tags_user_name_key on public.tags (user_id, lower(name));

alter table public.tags enable row level security;
create policy "tags: только свои" on public.tags
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Удалённый тег снимается со всех челленджей владельца в той же транзакции.
create function public.tags_detach() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.challenges
     set tag_ids = array_remove(tag_ids, old.id)
   where user_id = old.user_id and old.id = any (tag_ids);
  return old;
end $$;

create trigger tags_detach after delete on public.tags
  for each row execute function public.tags_detach();

-- ---------- итог дня ----------

create table public.day_logs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- день — локальная календарная дата, YYYY-MM-DD
  day date not null,
  mood smallint not null check (mood between 0 and 10),
  wellbeing smallint not null check (wellbeing between 0 and 10),
  productivity smallint not null check (productivity between 0 and 10),
  -- теги дня — имена из закрытого списка (src/domain/tags.ts)
  tags text[] not null default '{}',
  note text not null default '',
  closed_at timestamptz,
  primary key (user_id, day)
);

alter table public.day_logs enable row level security;
create policy "day_logs: только свои" on public.day_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- начало дня и утро ----------

create table public.day_starts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  -- утро: все три оценки или ни одной (утро пропущено)
  morning_sleep smallint check (morning_sleep between 0 and 10),
  morning_wellbeing smallint check (morning_wellbeing between 0 and 10),
  morning_mood smallint check (morning_mood between 0 and 10),
  started_at timestamptz not null,
  -- второе начало того же дня — нарушение ключа
  primary key (user_id, day),
  check (
    (morning_sleep is null) = (morning_wellbeing is null)
    and (morning_wellbeing is null) = (morning_mood is null)
  )
);

alter table public.day_starts enable row level security;
-- Утро не правится: политики на изменение нет. Удалить свою запись владелец может — это нужно
-- для очистки тестового пользователя и будущего «удалить мои данные»; сайт записи не удаляет.
create policy "day_starts: читать свои" on public.day_starts
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "day_starts: начать свой день" on public.day_starts
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "day_starts: удалить свои" on public.day_starts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- настройки ----------

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- час, до которого спрашивается утро; сам час уже не утро
  morning_until smallint not null default 15 check (morning_until between 0 and 23),
  -- порядок блоков на экране дня
  day_groups text[] not null default '{tasks,holds}' check (day_groups <@ array['tasks', 'holds']::text[])
);

alter table public.user_settings enable row level security;
create policy "user_settings: только свои" on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- доступ ----------

-- Гостю (anon) — ничего: политики выше только для вошедших.
revoke all on public.challenges, public.entries, public.tags, public.day_logs, public.day_starts, public.user_settings
  from anon;
grant select, insert, update, delete on public.challenges, public.entries, public.tags, public.day_logs, public.user_settings
  to authenticated;
grant select, insert, delete on public.day_starts to authenticated;
