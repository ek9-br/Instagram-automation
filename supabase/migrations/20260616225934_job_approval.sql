-- Camada de aprovação dos jobs.
-- Apenas o aprovador (eduardo.canova@coalize.com.br) pode mudar a aprovação.
-- Finalizar um post só é permitido se estiver 'approved'.

alter table public.jobs
  add column approval       text not null default 'pending'
                              check (approval in ('pending', 'approved', 'changes_requested')),
  add column approval_notes text,
  add column approved_by    text,
  add column approved_at    timestamptz,
  add column finalized_at   timestamptz;

-- Enforcement no banco (independe do front).
create or replace function public.enforce_job_approval()
returns trigger
language plpgsql
security definer
as $$
declare
  approver  constant text := 'eduardo.canova@coalize.com.br';
  requester text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
begin
  -- Só o aprovador pode alterar o campo approval.
  if new.approval is distinct from old.approval then
    if requester is distinct from approver then
      raise exception 'Apenas % pode aprovar ou solicitar alterações.', approver
        using errcode = '42501';
    end if;
    if new.approval = 'approved' then
      new.approved_by := requester;
      new.approved_at := now();
    else
      new.approved_by := null;
      new.approved_at := null;
    end if;
  end if;

  -- Finalizar exige aprovação.
  if new.finalized_at is not null and old.finalized_at is null then
    if new.approval <> 'approved' then
      raise exception 'O post precisa estar aprovado antes de finalizar.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_job_approval
  before update on public.jobs
  for each row execute function public.enforce_job_approval();
