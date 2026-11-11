ALTER TABLE "items" ADD COLUMN "precio_min" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "precio_max" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "precio_moneda" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "precio_at" timestamp with time zone;--> statement-breakpoint
-- A mano (drizzle-kit no lo genera): los deseos ya cargados también llevan su número, con las mismas reglas que
-- leerPrecio (src/lib/pesos.ts) para los formatos simples. Lo que no entra acá ("45k", "15 lucas", "a consultar") queda
-- en null, y al leerlo se intenta de nuevo con leerPrecio (ver pickItemFields). tests/precio-datos-viejos.test.ts fija
-- que lo que pone este SQL es lo mismo que lee leerPrecio.
-- La fecha del precio de lo que ya estaba: la del deseo (no se guarda cuándo se editó).
UPDATE "items" SET "precio_at" = "created_at"
WHERE nullif(btrim(coalesce("precio", "rango_precio")), '') IS NOT NULL;--> statement-breakpoint
-- Pesos: "$45.000", "$ 45000", "45.000", "$1.500,50" (redondeado).
UPDATE "items" SET
  "precio_min" = round(replace(replace(substring(btrim(coalesce("precio", "rango_precio")) from '[0-9][0-9.,]*$'), '.', ''), ',', '.')::numeric)::integer,
  "precio_moneda" = 'ARS'
WHERE btrim(coalesce("precio", "rango_precio")) ~ '^\$?\s*([1-9][0-9]{0,2}(\.[0-9]{3}){1,2}|[1-9][0-9]{0,8})(,[0-9]{1,2})?$';--> statement-breakpoint
-- Dólares: "US$ 300", "u$s 1.200", "USD 79,99" (redondeado).
UPDATE "items" SET
  "precio_min" = round(replace(replace(substring(btrim(coalesce("precio", "rango_precio")) from '[0-9][0-9.,]*$'), '.', ''), ',', '.')::numeric)::integer,
  "precio_moneda" = 'USD'
WHERE btrim(coalesce("precio", "rango_precio")) ~* '^(US\$|U\$[SD]|USD)\s*([1-9][0-9]{0,2}(\.[0-9]{3}){1,2}|[1-9][0-9]{0,8})(,[0-9]{1,2})?$';--> statement-breakpoint
-- Un rango en pesos con los dos números enteros, de mil para arriba ("$20.000 a $40.000", "$ 20000 - 40000"): piso y
-- techo. Si el segundo es más chico no es un techo ("$45.000 - 2000 de envío"): queda solo el piso.
UPDATE "items" SET
  "precio_min" = m.piso,
  "precio_max" = CASE WHEN m.techo >= m.piso THEN m.techo END,
  "precio_moneda" = 'ARS'
FROM (
  SELECT x."id", replace(x.r[1], '.', '')::integer AS piso, replace(x.r[2], '.', '')::integer AS techo
  FROM (
    SELECT "id", regexp_match(
      btrim(coalesce("precio", "rango_precio")),
      '^\$?\s*([1-9][0-9]{0,2}(?:\.[0-9]{3}){1,2}|[1-9][0-9]{3,8})\s*(?:a|-|–|—)\s*\$?\s*([1-9][0-9]{0,2}(?:\.[0-9]{3}){1,2}|[1-9][0-9]{3,8})$'
    ) AS r FROM "items"
  ) x WHERE x.r IS NOT NULL
) m WHERE "items"."id" = m."id";
