-- Порядок челленджей — одним запросом: перестановка из N отдельных запросов оставляла в базе половину
-- нового порядка, если один падал, а две перестановки подряд перемешивались (ревью 23.09).
-- ids — весь список в новом порядке (считает клиент, data/order.ts). Функция работает с правами
-- вызывающего: RLS пускает только к своим челленджам.
create function public.reorder_challenges(ids uuid[]) returns void
language sql security invoker set search_path = '' as $$
  update public.challenges c
     set sort_order = o.pos - 1
    from unnest(ids) with ordinality as o(id, pos)
   where c.id = o.id and c.sort_order is distinct from o.pos - 1;
$$;

revoke all on function public.reorder_challenges(uuid[]) from public, anon;
grant execute on function public.reorder_challenges(uuid[]) to authenticated;
