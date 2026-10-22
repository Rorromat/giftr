-- Datos de antes de los arreglos de grupos (0009). Se puede volver a correr: lo que ya está bien no cambia.
-- Corre en el build, mientras todavía sirve el código de antes: no inserta avisos de tipos que ese código no conoce
-- (se le caerían las páginas a quien los tenga). Los cambios de abajo no avisan; al unirse de ahora en más, sí.
--
-- 1. Los co-dueños que salieron antes de que existiera salio_at no quedaron anotados: la fila se borraba. Lo único que
--    queda de ellos es un codazo de ese grupo (solo les llega a los dueños). Se anotan como ex, así siguen sin ver lo
--    reservado. Los que salieron sin haber recibido ninguno no se pueden reconstruir.
--    No se sabe cuándo se sumaron, pero cuando les llegó el primer codazo de ese grupo ya eran dueños: quedan con esa
--    fecha. Así, si vuelven con la invitación, no sacan a nadie que ya estaba, y nadie que llegó después los saca (ver
--    sacarDelGrupo). Con la fecha del grupo empataban con el que lo armó y le ganaban a todos los demás. Los que se
--    sumaron entre su llegada y ese codazo sí los podrían sacar: precio aceptado, gana el que nunca se fue. Uno que
--    armó el grupo, salió y vuelve cuenta como sumado en esa fecha: no se lo puede distinguir.
INSERT INTO "list_members" ("list_id", "user_id", "created_at", "salio_at")
SELECT c."list_id", c."para_user_id", min(c."created_at"), now()
FROM "codazos" c JOIN "lists" l ON l."id" = c."list_id"
WHERE l."tipo" = 'grupo'
GROUP BY c."list_id", c."para_user_id"
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
--    propia reserva o compra de ese deseo. Lo ve en Cuentas, en "En curso".
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
  RETURNING g."claim_id", g."organizer_user_id"
)
UPDATE "claims" c SET "claimer_user_id" = p."organizer_user_id", "updated_at" = now()
FROM "pasados" p WHERE c."id" = p."claim_id";
--> statement-breakpoint
-- 5. Si no quedaba nadie para organizarlo, se cancela y el deseo se libera.
WITH "cancelados" AS (
  UPDATE "group_gifts" g SET "estado" = 'cancelado'
  FROM "items" i
  WHERE i."id" = g."item_id" AND g."estado" = 'abierto'
    AND EXISTS (SELECT 1 FROM "list_members" lm WHERE lm."list_id" = i."list_id" AND lm."user_id" = g."organizer_user_id")
  RETURNING g."claim_id"
)
UPDATE "claims" c SET "estado" = 'liberado', "updated_at" = now()
FROM "cancelados" x WHERE c."id" = x."claim_id";
