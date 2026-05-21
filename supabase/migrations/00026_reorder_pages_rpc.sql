-- Atomic page reorder via a single transactional RPC call.
-- Accepts a JSON array of { id, sort_order } objects and updates all
-- rows in a single transaction, preventing inconsistent state when
-- two admins reorder simultaneously.

create or replace function reorder_pages(updates jsonb)
returns void
language plpgsql
security definer
as $$
declare
  item jsonb;
begin
  for item in select * from jsonb_array_elements(updates)
  loop
    update pages
    set sort_order = (item ->> 'sort_order')::int
    where id = (item ->> 'id')::uuid;
  end loop;
end;
$$;
