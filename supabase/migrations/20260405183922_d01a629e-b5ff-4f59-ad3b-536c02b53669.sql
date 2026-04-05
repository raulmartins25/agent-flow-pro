-- Merge duplicates: keep the conversation with the most messages, move messages from others to it
DO $$
DECLARE
  main_id uuid;
  dup_id uuid;
  dup_ids uuid[];
BEGIN
  -- Find the conversation with most messages for 5562995085665 / agent be7924ba
  SELECT c.id INTO main_id
  FROM conversations c
  LEFT JOIN (SELECT conversation_id, count(*) as cnt FROM messages GROUP BY conversation_id) m ON m.conversation_id = c.id
  WHERE c.contact_number = '5562995085665' AND c.agent_id = 'be7924ba-aa5b-4a28-a8c9-961c070b889c'
  ORDER BY COALESCE(m.cnt, 0) DESC, c.created_at ASC
  LIMIT 1;

  IF main_id IS NOT NULL THEN
    -- Get all other conversation IDs
    SELECT array_agg(c.id) INTO dup_ids
    FROM conversations c
    WHERE c.contact_number = '5562995085665' 
      AND c.agent_id = 'be7924ba-aa5b-4a28-a8c9-961c070b889c'
      AND c.id != main_id;

    IF dup_ids IS NOT NULL THEN
      -- Move messages from duplicates to main
      UPDATE messages SET conversation_id = main_id WHERE conversation_id = ANY(dup_ids);
      -- Delete duplicates
      DELETE FROM conversations WHERE id = ANY(dup_ids);
      -- Update main conversation
      UPDATE conversations SET 
        status = 'active',
        contact_name = 'Raul',
        last_message_at = (SELECT max(created_at) FROM messages WHERE conversation_id = main_id)
      WHERE id = main_id;
    END IF;
  END IF;
END $$;