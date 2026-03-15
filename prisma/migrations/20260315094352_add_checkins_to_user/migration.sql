-- AlterTable (this migration only adds the relation, no schema change needed)
-- The relation was already defined on UserCheckIn, and we added the checkIns field to User.
-- No SQL changes are required because the foreign key already exists.
-- This migration is empty – it just records the schema change.
SELECT 1;
