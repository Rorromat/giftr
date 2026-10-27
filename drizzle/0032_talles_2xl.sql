-- Los talles largos de remera se escriben con el número: XXL → 2XL, XXXL → 3XL (y XXS → 2XS, XXXS → 3XS).
UPDATE "users"
SET "gustos" = jsonb_set("gustos", '{talles,remera}', to_jsonb(CASE "gustos"->'talles'->>'remera'
  WHEN 'XXL' THEN '2XL' WHEN 'XXXL' THEN '3XL' WHEN 'XXS' THEN '2XS' WHEN 'XXXS' THEN '3XS' END))
WHERE "gustos"->'talles'->>'remera' IN ('XXL', 'XXXL', 'XXS', 'XXXS');
