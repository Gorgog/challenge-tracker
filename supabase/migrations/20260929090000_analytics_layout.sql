-- Раскладка экрана аналитики (решение Georgy 25.09): порядок блоков разбора и какие открыты — в аккаунте,
-- чтобы на компьютере и телефоне было одинаково. Список блоков — как ANALYTICS_BLOCKS в src/domain/analyticsLayout.ts;
-- новый блок — и туда, и в эти проверки. Права и RLS — у таблицы user_settings (init), новые колонки их наследуют.
-- Вкладка со старым сайтом пишет user_settings без этих колонок — upsert их не трогает.

alter table public.user_settings
  add column analytics_order text[] not null default '{links,changes,cases,explains}'
    check (analytics_order <@ array['links', 'changes', 'cases', 'explains']::text[]),
  add column analytics_open text[] not null default '{}'
    check (analytics_open <@ array['links', 'changes', 'cases', 'explains']::text[]);
