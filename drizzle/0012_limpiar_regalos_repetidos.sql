-- Datos de antes de que "Armar regalo grupal" fuera idempotente: un doble toque armaba dos regalos abiertos del mismo
-- encargado sobre el mismo deseo, cada uno con su reserva. Esas reservas no vencen (las maneja el encargado), así que el
-- deseo quedaba con un lugar de más ocupado para siempre ("Pide 1 y hay 2 reservas") y cada uno se sumaba a uno distinto.
-- Se puede volver a correr: lo que ya está bien no cambia. No avisa a nadie: el encargado se queda con uno.
--
-- 1. De los repetidos, se cancelan los que no tienen a nadie más que el encargado, si queda otro: el que tiene gente o,
--    entre los vacíos, el más viejo. Si dos tienen gente, quedan los dos: los resuelve el encargado.
UPDATE "group_gifts" g SET "estado" = 'cancelado'
WHERE g."estado" = 'abierto'
  AND NOT EXISTS (SELECT 1 FROM "group_gift_members" m WHERE m."gift_id" = g."id" AND m."user_id" <> g."organizer_user_id")
  AND EXISTS (
    SELECT 1 FROM "group_gifts" o
    WHERE o."id" <> g."id" AND o."item_id" = g."item_id" AND o."organizer_user_id" = g."organizer_user_id" AND o."estado" = 'abierto'
      AND (
        EXISTS (SELECT 1 FROM "group_gift_members" m WHERE m."gift_id" = o."id" AND m."user_id" <> o."organizer_user_id")
        OR o."created_at" < g."created_at" OR (o."created_at" = g."created_at" AND o."id" < g."id")
      )
  );
--> statement-breakpoint
-- 2. Y se libera su reserva (la de un regalo cancelado siempre se libera, como en cancelarRegalo), salvo que la use otro
--    regalo que sigue.
UPDATE "claims" c SET "estado" = 'liberado', "updated_at" = now()
WHERE c."estado" = 'reservado'
  AND EXISTS (SELECT 1 FROM "group_gifts" g WHERE g."claim_id" = c."id" AND g."estado" = 'cancelado')
  AND NOT EXISTS (SELECT 1 FROM "group_gifts" g WHERE g."claim_id" = c."id" AND g."estado" <> 'cancelado');
