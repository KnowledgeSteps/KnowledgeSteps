ALTER TABLE assessment_questions ADD COLUMN heard_check_text TEXT;
ALTER TABLE assessment_questions ADD COLUMN heard_check_expected INTEGER CHECK (heard_check_expected IN (0, 1));
ALTER TABLE assessment_questions ADD COLUMN heard_check_explanation TEXT;
ALTER TABLE assessment_questions ADD COLUMN basic_check_text TEXT;
ALTER TABLE assessment_questions ADD COLUMN basic_check_expected INTEGER CHECK (basic_check_expected IN (0, 1));
ALTER TABLE assessment_questions ADD COLUMN basic_check_explanation TEXT;
ALTER TABLE assessment_questions ADD COLUMN familiar_check_text TEXT;
ALTER TABLE assessment_questions ADD COLUMN familiar_check_expected INTEGER CHECK (familiar_check_expected IN (0, 1));
ALTER TABLE assessment_questions ADD COLUMN familiar_check_explanation TEXT;
