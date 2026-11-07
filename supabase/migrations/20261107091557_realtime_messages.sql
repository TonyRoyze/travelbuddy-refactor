-- Only the authenticated user's private notification topic is readable.
-- Payloads contain no chat contents; existing RPC authorization remains authoritative.
CREATE POLICY travelbuddy_chat_notifications ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension = 'broadcast'
  AND (SELECT realtime.topic()) = 'chat:' || (SELECT auth.uid())::text
);

CREATE FUNCTION travelbuddy_private.notify_chat_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE participant record;
BEGIN
  -- This trigger needs private account lookup and Realtime insert privileges.
  -- It cannot be invoked directly and sends only to the actual participants.
  FOR participant IN
    SELECT a.supabase_user_id
    FROM travelbuddy_backend.accounts a
    JOIN travelbuddy_backend.conversations c
      ON a.id IN (c.participant_one_id, c.participant_two_id)
    WHERE c.id = NEW.conversation_id AND a.supabase_user_id IS NOT NULL
  LOOP
    PERFORM realtime.send(
      jsonb_build_object('conversationId', NEW.conversation_id),
      'changed', 'chat:' || participant.supabase_user_id::text, true
    );
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION travelbuddy_private.notify_chat_message() FROM PUBLIC, anon, authenticated;

-- Attachment/package sends update the inserted row in the same transaction.
-- Realtime delivers notifications after commit, so refetches see the final message.
CREATE TRIGGER notify_chat_message
AFTER INSERT OR UPDATE ON travelbuddy_backend.messages
FOR EACH ROW EXECUTE FUNCTION travelbuddy_private.notify_chat_message();
