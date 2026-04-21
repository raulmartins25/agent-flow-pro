
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  -- Só insere se o usuário ainda não existir
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'raul15.rmm@gmail.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'raul15.rmm@gmail.com',
      crypt('Nakx6zeyz**##', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Raul"}'::jsonb,
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      new_user_id,
      new_user_id::text,
      format('{"sub":"%s","email":"%s","email_verified":true}', new_user_id, 'raul15.rmm@gmail.com')::jsonb,
      'email',
      now(), now(), now()
    );
  END IF;
END $$;
