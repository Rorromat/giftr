-- Datos de antes de los arreglos de grupos (0009). Se puede volver a correr: lo que ya está bien no cambia.
--
-- 1. Los co-dueños que salieron antes de que existiera salio_at no quedaron anotados: la fila se borraba. Lo único que
--    queda de ellos es un codazo de ese grupo (solo les llega a los dueños). Se anotan como ex, así siguen sin ver lo
--    reservado. Los que salieron sin haber recibido ninguno no se pueden reconstruir.
INSERT INTO "list_members" ("list_id", "user_id", "salio_at")
SELECT DISTINCT c."list_id", c."para_user_id", now()
FROM "codazos" c JOIN "lists" l ON l."id" = c."list_id"
WHERE l."tipo" = 'grupo'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Lo mismo que hace soltarLoQueRegalaba (src/lib/groups.ts) al unirse, para los que se unieron (o son ex) desde antes:
-- un regalador que pasaba a ser co-dueño dejaba sus reservas y regalos grupales de esa lista trabados para siempre.
-- 2. Sus reservas sueltas sin comprar sobre deseos de su grupo se liberan.
UPDATE "claims" c SET "estado" = 'liberado', "updated_at" = now()
FROM "items" i, "list_members" lm
WHERE i."id" = c."item_id" AND lm."list_id" = i."list_id" AND lm."user_id" = c."claimer_user_id"
  AND c."estado" = 'reservado'
  AND c."id" NOT IN (SELECT "claim_id" FROM "group_gifts");
--> statement-breakpoint
-- 3. De los regalos grupales abiertos de su grupo se bajan (también si lo organizaban: eso se resuelve abajo).
DELETE FROM "group_gift_members" m
USING "group_gifts" g, "items" i, "list_members" lm
WHERE g."id" = m."gift_id" AND i."id" = g."item_id" AND lm."list_id" = i."list_id" AND lm."user_id" = m."user_id"
  AND g."estado" = 'abierto';
--> statement-breakpoint
-- 4. Si lo organizaba, el encargo (y la reserva) pasa al que se sumó primero de los que quedan, salvo uno que ya tiene su
--    propia reserva o compra de ese deseo, y se le avisa.
WITH "trabados" AS (
  SELECT g."id", g."item_id"
  FROM "group_gifts" g JOIN "items" i ON i."id" = g."item_id"
  WHERE g."estado" = 'abierto'
    AND EXISTS (SELECT 1 FROM "list_members" lm WHERE lm."list_id" = i."list_id" AND lm."user_id" = g."organizer_user_id")
), "siguientes" AS (
  SELECT DISTINCT ON (t."id") t."id" AS "gift_id", m."user_id"
  FROM "trabados" t JOIN "group_gift_members" m ON m."gift_id" = t."id"
  WHERE NOT EXISTS (
    SELECT 1 FROM "claims" c
    WHERE c."item_id" = t."item_id" AND c."claimer_user_id" = m."user_id" AND c."estado" IN ('reservado', 'comprado')
  )
  ORDER BY t."id", m."created_at"
), "pasados" AS (
  UPDATE "group_gifts" g SET "organizer_user_id" = s."user_id"
  FROM "siguientes" s WHERE g."id" = s."gift_id"
  RETURNING g."claim_id", g."organizer_user_id", g."item_id"
), "reservas" AS (
  UPDATE "claims" c SET "claimer_user_id" = p."organizer_user_id", "updated_at" = now()
  FROM "pasados" p WHERE c."id" = p."claim_id"
)
INSERT INTO "notifications" ("user_id", "tipo", "item_id")
SELECT "organizer_user_id", 'regalo_encargo', "item_id" FROM "pasados";
--> statement-breakpoint
-- 5. Si no quedaba nadie para organizarlo, se cancela, el deseo se libera y se les avisa a los que estaban.
WITH "cancelados" AS (
  UPDATE "group_gifts" g SET "estado" = 'cancelado'
  FROM "items" i
  WHERE i."id" = g."item_id" AND g."estado" = 'abierto'
    AND EXISTS (SELECT 1 FROM "list_members" lm WHERE lm."list_id" = i."list_id" AND lm."user_id" = g."organizer_user_id")
  RETURNING g."id", g."claim_id", g."item_id"
), "liberadas" AS (
  UPDATE "claims" c SET "estado" = 'liberado', "updated_at" = now()
  FROM "cancelados" x WHERE c."id" = x."claim_id"
)
INSERT INTO "notifications" ("user_id", "tipo", "item_id")
SELECT m."user_id", 'regalo_cancelado', x."item_id"
FROM "cancelados" x JOIN "group_gift_members" m ON m."gift_id" = x."id";
