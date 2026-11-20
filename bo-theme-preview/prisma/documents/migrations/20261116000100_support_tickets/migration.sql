BEGIN;
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  subject VARCHAR(120) NOT NULL, category VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE support_ticket_messages (
  id UUID PRIMARY KEY, ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sender_role VARCHAR(20) NOT NULL CHECK (sender_role IN ('customer', 'care')),
  body VARCHAR(2000) NOT NULL, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX support_tickets_owner_updated_idx ON support_tickets(owner_id, updated_at DESC);
CREATE INDEX support_ticket_messages_ticket_created_idx ON support_ticket_messages(ticket_id, created_at, id);
REVOKE ALL ON TABLE support_tickets, support_ticket_messages FROM PUBLIC, anon, authenticated;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY backend_access ON support_tickets TO travelbuddy_app USING (true) WITH CHECK (true);
CREATE POLICY backend_access ON support_ticket_messages TO travelbuddy_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON support_tickets, support_ticket_messages TO travelbuddy_app;
COMMIT;
