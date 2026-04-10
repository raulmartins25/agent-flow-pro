CREATE UNIQUE INDEX IF NOT EXISTS conversations_agent_device_contact_active
  ON conversations (agent_id, device_id, contact_number)
  WHERE status IN ('active', 'paused', 'transferred');