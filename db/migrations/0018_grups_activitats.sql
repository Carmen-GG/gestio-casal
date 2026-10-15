-- Grups d'activitats que no es poden acumular (petició de 2026-10-15): cada activitat
-- pot tenir un número de grup (1 = esportives, 2 = ball...) i el cicle indica quantes
-- activitats de cada grup pot obtenir una mateixa persona a l'adjudicació.
ALTER TABLE activitats ADD COLUMN grup INTEGER CHECK (grup IS NULL OR (grup BETWEEN 1 AND 99));
ALTER TABLE cicles ADD COLUMN limits_grups TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(limits_grups));
