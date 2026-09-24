-- Ночь перед утром (срез 3, 25.09.2026): когда лёг и когда встал — утренний ответ о прошедшей ночи.
-- Минуты от полуночи этого дня: лёг в 23:30 = -30, в 01:20 = 80; встал в 07:40 = 460.
-- how — как дан ответ: 'usual' — кнопка «как обычно», 'exact' — точное время.
-- Старые утра — без ночи (null). Права прежние: update у day_starts нет, ночь не правится, как и утро.

alter table public.day_starts
  add column bed_min smallint check (bed_min between -720 and 719),
  add column wake_min smallint check (wake_min between 0 and 1439),
  add column bed_how text check (bed_how in ('usual', 'exact')),
  add column wake_how text check (wake_how in ('usual', 'exact')),
  add constraint day_starts_night_whole check (
    (bed_min is null) = (wake_min is null)
    and (bed_min is null) = (bed_how is null)
    and (wake_min is null) = (wake_how is null)
  ),
  add constraint day_starts_night_order check (bed_min < wake_min),
  add constraint day_starts_night_with_morning check (bed_min is null or morning_sleep is not null);
