-- Отказ отвечает вечером «Да, без» (срез 5а, 25.09.2026). Отметка отказа — ответ дня: 1 «Да, без», 0 «сорвался»;
-- нет строки — «не записано» (прошлый день) или день ещё идёт (сегодня). Раньше отсутствие строки означало
-- выдержанный день, и забытые дни засчитывались успехом (src/domain/streaks.ts, dayOutcome).
-- Права на таблицы не меняются: новых таблиц нет.

-- 1. У отказа отметка — только 0 или 1. Проверка в демо-хранилище та же (src/data/demoRepo.ts).
create function public.entries_quit_answer() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.value not in (0, 1)
     and exists (select 1 from public.challenges c where c.id = new.challenge_id and c.kind = 'quit') then
    raise exception 'У отказа отметка — только «Да, без» (1) или «сорвался» (0)' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger entries_quit_answer before insert or update on public.entries
  for each row execute function public.entries_quit_answer();

-- 2. Прошлое (решение Georgy 25.09): закрытый итогом день без срыва — «Да, без», как и было задумано; незакрытый
-- остаётся без ответа — «не записано». Дни паузы и после удаления тоже получат 1, но домен считает их вне
-- челленджа (dayOutcome → 'outside'), так что на статистику это не влияет.
insert into public.entries (challenge_id, user_id, day, value)
select c.id, c.user_id, l.day, 1
from public.challenges c
join public.day_logs l on l.user_id = c.user_id and l.day >= c.start_date
where c.kind = 'quit'
on conflict (challenge_id, day) do nothing;

-- 3. Тип у челленджа с отметками не меняется (ревью 5а, решение Georgy): «прочитал» задним числом стал бы «Да, без»,
-- а число страниц — ответом отказа. Домен (applyPatch с marked) такие правки не отправляет — здесь страховка базы.
create function public.challenges_keep_kind() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.kind <> new.kind and exists (select 1 from public.entries e where e.challenge_id = old.id) then
    raise exception 'Тип у челленджа с отметками не меняется' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger challenges_keep_kind before update on public.challenges
  for each row execute function public.challenges_keep_kind();
