-- Port Call Intelligence revoke anonymous vessel-selector execution v1

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

revoke all on function public.pci_list_company_vessels(uuid) from anon;
revoke all on function public.pci_list_company_vessels(uuid) from public;

grant execute on function public.pci_list_company_vessels(uuid)
  to authenticated;

commit;