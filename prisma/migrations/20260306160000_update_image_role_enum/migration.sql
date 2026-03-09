-- Rename old enum so we can recreate it with new values
ALTER TYPE "ImageRole" RENAME TO "ImageRole_old";

-- Create new enum with fire-door specific values
CREATE TYPE "ImageRole" AS ENUM (
  'FRONT_FACE',
  'REAR_FACE',
  'FRAME_GAP',
  'INTUMESCENT_STRIP',
  'SELF_CLOSER',
  'HINGES',
  'SIGNAGE',
  'OTHER'
);

-- Migrate existing data: map old values to nearest new equivalents
ALTER TABLE "door_images"
  ALTER COLUMN role DROP DEFAULT,
  ALTER COLUMN role TYPE "ImageRole"
    USING (
      CASE role::text
        WHEN 'FRONT' THEN 'FRONT_FACE'
        WHEN 'BACK'  THEN 'REAR_FACE'
        WHEN 'LOCK'  THEN 'HINGES'
        WHEN 'FRAME' THEN 'FRAME_GAP'
        ELSE 'OTHER'
      END
    )::"ImageRole";

-- Drop old enum
DROP TYPE "ImageRole_old";
