-- Private conversation files; package snapshots are constructed by the server.
ALTER TABLE travelbuddy_backend.messages ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(attachments) = 'array' AND jsonb_array_length(attachments) <= 4);

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-files', 'chat-files', false, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','video/mp4','video/webm']);

CREATE FUNCTION travelbuddy_private.chat_file_access(object_name text, writing boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM travelbuddy_backend.conversations c
    JOIN travelbuddy_backend.accounts a ON a.supabase_user_id = auth.uid()
    WHERE c.id::text = split_part(object_name, '/', 1)
      AND a.data->>'status' = 'active' AND a.data->>'onboarding' = 'completed'
      AND a.id IN (c.participant_one_id, c.participant_two_id)
      AND (NOT writing OR (split_part(object_name, '/', 2) = auth.uid()::text
        AND NOT EXISTS (SELECT 1 FROM travelbuddy_backend.messages m
          WHERE m.conversation_id = c.id AND m.attachments @> jsonb_build_array(jsonb_build_object('path', object_name)))))
  )
$$;
ALTER FUNCTION travelbuddy_private.chat_file_access(text, boolean) OWNER TO travelbuddy_api_executor;
REVOKE ALL ON FUNCTION travelbuddy_private.chat_file_access(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION travelbuddy_private.chat_file_access(text, boolean) TO authenticated;
CREATE POLICY chat_files_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-files' AND travelbuddy_private.chat_file_access(name));
CREATE POLICY chat_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-files' AND travelbuddy_private.chat_file_access(name, true));
CREATE POLICY chat_files_delete_draft ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-files' AND travelbuddy_private.chat_file_access(name, true));
GRANT USAGE ON SCHEMA storage TO travelbuddy_api_executor;
GRANT SELECT ON storage.objects TO travelbuddy_api_executor;
CREATE POLICY chat_files_executor_read ON storage.objects FOR SELECT TO travelbuddy_api_executor
  USING (bucket_id = 'chat-files');

CREATE FUNCTION travelbuddy_private.send_chat_message(conversation_id uuid, body text, files jsonb DEFAULT '[]', package_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  a jsonb := travelbuddy_private.account(); item jsonb; obj storage.objects;
  pack travelbuddy_backend.packages; snapshot jsonb; saved_files jsonb := '[]'; result uuid;
BEGIN
  IF files IS NULL OR jsonb_typeof(files) <> 'array' THEN RAISE EXCEPTION 'Invalid attachments.'; END IF;
  IF jsonb_array_length(files) > 4 THEN RAISE EXCEPTION 'Attach up to four files.'; END IF;
  IF length(coalesce(body, '')) > 1000 THEN RAISE EXCEPTION 'Messages can have up to 1000 characters.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM travelbuddy_backend.conversations c WHERE c.id = conversation_id
    AND (a->>'id')::uuid IN (c.participant_one_id, c.participant_two_id)) THEN
    RAISE EXCEPTION 'Conversation not found.' USING ERRCODE = '42501';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(files) LOOP
    IF jsonb_typeof(item) <> 'object' OR length(coalesce(item->>'name', '')) NOT BETWEEN 1 AND 255
      OR left(coalesce(item->>'path',''), length(conversation_id::text || '/' || auth.uid()::text || '/'))
        <> conversation_id::text || '/' || auth.uid()::text || '/' THEN
      RAISE EXCEPTION 'Invalid attachment.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO obj FROM storage.objects o WHERE o.bucket_id = 'chat-files' AND o.name = item->>'path';
    IF NOT FOUND THEN RAISE EXCEPTION 'Upload the attachment before sending.'; END IF;
    saved_files := saved_files || jsonb_build_array(jsonb_build_object(
      'path', obj.name, 'name', item->>'name', 'type', obj.metadata->>'mimetype', 'size', obj.metadata->'size'));
  END LOOP;
  IF package_id IS NOT NULL THEN
    SELECT * INTO pack FROM travelbuddy_backend.packages p WHERE p.id = package_id
      AND p.owner_id = (a->>'id')::uuid AND p.published;
    IF NOT FOUND OR NOT (a->'roles' ?| ARRAY['provider','guide']) THEN
      RAISE EXCEPTION 'Choose one of your published packages.' USING ERRCODE = '42501';
    END IF;
    snapshot := jsonb_build_object('id', pack.id, 'title', pack.title,
      'description', pack.data->>'description', 'price', pack.price, 'currency', 'LKR');
  END IF;
  IF length(trim(coalesce(body,''))) = 0 AND saved_files = '[]' AND snapshot IS NULL THEN
    RAISE EXCEPTION 'Write a message or add an attachment.';
  END IF;
  result := travelbuddy_private.send_message(conversation_id, coalesce(nullif(trim(body),''),
    CASE WHEN snapshot IS NOT NULL THEN 'Shared an experience' ELSE 'Shared attachments' END));
  UPDATE travelbuddy_backend.messages SET attachments = saved_files, package = snapshot WHERE id = result;
  RETURN result;
END $$;
ALTER FUNCTION travelbuddy_private.send_chat_message(uuid,text,jsonb,text) OWNER TO travelbuddy_api_executor;
REVOKE ALL ON FUNCTION travelbuddy_private.send_chat_message(uuid,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION travelbuddy_private.send_chat_message(uuid,text,jsonb,text) TO authenticated;
CREATE FUNCTION travelbuddy_api.send_chat_message(conversation_id uuid, body text, files jsonb DEFAULT '[]', package_id text DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT travelbuddy_private.send_chat_message(conversation_id, body, files, package_id)
$$;
REVOKE ALL ON FUNCTION travelbuddy_api.send_chat_message(uuid,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION travelbuddy_api.send_chat_message(uuid,text,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION travelbuddy_private.messages(conversation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a jsonb := travelbuddy_private.account(); result jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM travelbuddy_backend.conversations c WHERE c.id=conversation_id
    AND (a->>'id')::uuid IN(c.participant_one_id,c.participant_two_id)) THEN
    RAISE EXCEPTION 'Conversation not found.' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(row_data ORDER BY created_at,id),'[]') INTO result FROM (
    SELECT m.id,m.created_at,jsonb_build_object('id',m.id,'senderId',m.sender_id,'body',m.body,
      'package',m.package,'attachments',m.attachments,'createdAt',m.created_at) row_data
    FROM travelbuddy_backend.messages m WHERE m.conversation_id=messages.conversation_id
    ORDER BY m.created_at DESC,m.id DESC LIMIT 100) rows;
  RETURN result;
END $$;
NOTIFY pgrst, 'reload schema';
