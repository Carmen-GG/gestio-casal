-- Casal inicial de la plataforma (especificació: «Inicialment, crea un casal … Casal Cívic i
-- Comunitari Terrassa – Can Boada»). Així, a qualsevol entorn nou, el panell ja té el casal
-- disponible per triar-lo. Mateix identificador que les dades de prova locals (db/seeds/dev.sql),
-- que fan INSERT OR IGNORE i per tant no el dupliquen. No es modifica si ja existeix.
INSERT OR IGNORE INTO casals (id, codi, nom, municipi, adreca, actiu, configuracio, creat_el, actualitzat_el)
VALUES ('6f1c2a0e-0b7d-4c55-9a51-2f1f6c0d0001', 'CAN-BOADA',
        'Casal Cívic i Comunitari Terrassa – Can Boada', 'Terrassa', NULL, 1, '{}',
        '2026-10-14T00:00:00.000Z', '2026-10-14T00:00:00.000Z');
