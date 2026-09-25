-- Заметка утра (решение Georgy 25.09): необязательная строка в окне утра. Пишется вместе с утром и не правится —
-- update у day_starts нет (init). Только при утре: день без утра заметки не имеет. Предел — MORNING_NOTE_MAX
-- в src/domain/types.ts. Пустую сайт не шлёт (null). Вкладка со старым сайтом вставляет без колонки — null.

alter table public.day_starts
  add column morning_note text check (char_length(morning_note) between 1 and 1000),
  add constraint day_starts_note_with_morning check (morning_note is null or morning_sleep is not null);
