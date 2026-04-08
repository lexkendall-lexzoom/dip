-- Migration: 003_vault_accessor
-- Creates a security-definer function that lets the service role read
-- individual secrets from the Vault extension without needing direct
-- access to the vault schema (which supabase-js cannot query directly).

CREATE OR REPLACE FUNCTION public.get_vault_secret(secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  secret_value TEXT;
BEGIN
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;

  RETURN secret_value;
END;
$$;

-- Only the service role should be able to call this
REVOKE EXECUTE ON FUNCTION public.get_vault_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_vault_secret(TEXT) TO service_role;
