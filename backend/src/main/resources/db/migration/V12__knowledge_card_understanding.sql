ALTER TABLE knowledge_card_favorites ADD COLUMN understood INTEGER NOT NULL DEFAULT 0 CHECK (understood IN (0,1));
