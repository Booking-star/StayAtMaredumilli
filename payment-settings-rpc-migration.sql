insert into public.site_settings (key, value)
values ('payment', '{"mode": "manual", "upiId": ""}'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_payment_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.site_settings where key = 'payment'),
    '{"mode": "manual", "upiId": ""}'::jsonb
  );
$$;

revoke all on function public.get_payment_settings() from public;
grant execute on function public.get_payment_settings() to anon, authenticated;
