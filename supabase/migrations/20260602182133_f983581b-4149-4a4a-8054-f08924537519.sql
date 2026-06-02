REVOKE EXECUTE ON FUNCTION public.is_shared_chat_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_shared_chat_owner(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_shared_chat_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_shared_chat_owner(uuid, uuid) TO authenticated, service_role;