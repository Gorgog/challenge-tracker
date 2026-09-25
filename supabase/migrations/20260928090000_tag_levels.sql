-- Теги с количеством (срез 5б, 25.09.2026): у четырёх тегов дня есть ступень — алкоголь (порции, 3 ступени),
-- игры (часы, 4), стресс (3), работа допоздна (3). Ступень необязательна: тег без неё — «было, сколько — не
-- указано». tag_levels — {тег: ступень}; '{}' — ступеней нет, так читаются и все прежние итоги (src/data/rows.ts).
-- Правила те же, что в демо-хранилище (validLevels в src/domain/tags.ts): ступень — только у отмеченного тега с
-- количеством, целое от 1 до числа его ступеней. Права на таблицы не меняются: новых таблиц нет.

alter table public.day_logs
  add column tag_levels jsonb not null default '{}'::jsonb check (jsonb_typeof(tag_levels) = 'object');

-- Число ступеней — как LEVELS в src/domain/tags.ts: новый тег с количеством добавляется и туда, и сюда.
-- case, а не or: приведение к numeric — только после проверки, что значение число (строку привести нельзя).
create function public.day_logs_tag_levels() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- не объект — отказ даст check столбца (jsonb_each упал бы раньше и с другой ошибкой)
  if jsonb_typeof(new.tag_levels) is distinct from 'object' then
    return new;
  end if;
  if exists (
    select 1
    from jsonb_each(new.tag_levels) as l (tag, level)
    left join (values ('алкоголь', 3), ('игры', 4), ('стресс', 3), ('работа допоздна', 3)) as t (tag, steps)
      on t.tag = l.tag
    where case
      when not (l.tag = any (new.tags)) or t.steps is null or jsonb_typeof(l.level) <> 'number' then true
      else l.level::numeric <> trunc(l.level::numeric) or l.level::numeric not between 1 and t.steps
    end
  ) then
    raise exception 'Ступень — только у отмеченного тега с количеством, целое от 1 до числа его ступеней'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger day_logs_tag_levels before insert or update on public.day_logs
  for each row execute function public.day_logs_tag_levels();
