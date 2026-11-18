-- Run as the Supabase project administrator after migrations.
-- Private, flat per-user avatar paths; never use getPublicUrl().
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', false, 2097152, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Refuse to silently adopt an existing bucket with incompatible privacy limits.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='avatars' AND public=false
     AND file_size_limit<=2097152 AND allowed_mime_types IS NOT NULL
     AND allowed_mime_types <@ ARRAY['image/png','image/jpeg','image/webp']::text[]) THEN
   RAISE EXCEPTION 'Review existing avatars bucket privacy, size and MIME settings before proceeding';
 END IF;
END $$;

DROP POLICY IF EXISTS planner_avatar_boundary ON storage.objects;
CREATE POLICY planner_avatar_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO public
USING (bucket_id <> 'avatars' OR (storage.foldername(name))[1] = (select auth.uid())::text)
WITH CHECK (bucket_id <> 'avatars' OR (
  (storage.foldername(name))[1] = (select auth.uid())::text
  AND name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(png|jpg|webp)$')
));
DROP POLICY IF EXISTS planner_own_avatar ON storage.objects;
CREATE POLICY planner_own_avatar ON storage.objects FOR ALL TO authenticated
USING (bucket_id='avatars' AND (storage.foldername(name))[1]=(select auth.uid())::text)
WITH CHECK (bucket_id='avatars' AND (storage.foldername(name))[1]=(select auth.uid())::text);
