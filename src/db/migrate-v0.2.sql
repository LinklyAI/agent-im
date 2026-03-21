-- Agent-IM v0.2 migration
ALTER TABLE threads ADD COLUMN description TEXT;
ALTER TABLE messages ADD COLUMN reply_to TEXT;
