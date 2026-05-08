
DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Create auth user with confirmed email
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'sorria@admin.com',
    crypt('SorriaIA2025**##', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Sorria Parque Anhanguera"}'::jsonb,
    now(), now(), '', '', '', ''
  ) RETURNING id INTO new_user_id;

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', 'sorria@admin.com', 'email_verified', true),
    'email', new_user_id::text, now(), now(), now());

  INSERT INTO public.user_roles (user_id, role) VALUES (new_user_id, 'client');
  INSERT INTO public.client_device_access (user_id, device_id)
  VALUES (new_user_id, '0a94d30d-6a9d-4378-a546-db7ce11f152d');
END $$;
