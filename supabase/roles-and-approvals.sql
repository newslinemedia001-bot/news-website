-- Newsight roles and editorial approval migration
-- Run this in Supabase SQL Editor before using the role-based dashboard.

-- Every profile gets a role. Existing users become regular users by default.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

UPDATE public.users SET role = 'user' WHERE role IS NULL OR role = '';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (role IN ('user','author','admin'));

-- Keep the existing news.status values (published/draft) and add a separate
-- approval state. This avoids changing an existing status enum/check constraint.
ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';

ALTER TABLE public.news
  DROP CONSTRAINT IF EXISTS news_approval_status_check;
ALTER TABLE public.news
  ADD CONSTRAINT news_approval_status_check
  CHECK (approval_status IN ('pending','approved','rejected'));

-- Existing published posts are treated as already approved.
UPDATE public.news
SET approval_status = 'approved'
WHERE status = 'published';

-- Optional but recommended: automatically create a profile for new signups.
-- This assumes public.users has id, full_name, email and role columns.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- IMPORTANT: make your first administrator manually after running this file:
-- UPDATE public.users SET role = 'admin' WHERE email = 'YOUR-ADMIN-EMAIL';
