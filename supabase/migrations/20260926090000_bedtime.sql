-- «Ложусь раньше» (срез 4б, 24.09.2026): измерение 'bedtime' («Время» в форме) — цель «лечь не позже».
-- Цель — минуты от полуночи утра, как отбой в day_starts.bed_min: 23:30 = -30, 00:30 = 30; целые, от -720 до 719.
-- Только у привычки. Отметок у такого челленджа нет: выполнение считается на клиенте из ночи, записанной утром
-- (src/domain/bedtime.ts), поэтому отметку к нему база не принимает. Замок правил (challenges_keep_lock) уже
-- закрывает measure и goal. Права на таблицы не меняются: новых таблиц нет.

alter table public.challenges
  drop constraint challenges_measure_check,
  drop constraint challenges_goal_check,
  add constraint challenges_measure_check check (measure in ('binary', 'count', 'bedtime')),
  add constraint challenges_goal_check check (
    case
      when measure = 'bedtime' then goal between -720 and 719 and goal = trunc(goal)
      else goal > 0
    end
  ),
  add constraint challenges_bedtime_habit check (measure <> 'bedtime' or kind = 'do');

create function public.entries_no_bedtime() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.challenges c where c.id = new.challenge_id and c.measure = 'bedtime') then
    raise exception 'У «Ложусь раньше» отметок нет: отбой записывается утром' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger entries_no_bedtime before insert or update on public.entries
  for each row execute function public.entries_no_bedtime();
