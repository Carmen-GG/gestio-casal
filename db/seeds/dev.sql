-- Dades de prova NOMÉS per a l'entorn local o de proves. Totes són fictícies.
-- No contenen dades personals. No s'han d'executar a producció.
INSERT OR IGNORE INTO casals (id, codi, nom, municipi, adreca, actiu, configuracio, creat_el, actualitzat_el)
VALUES ('6f1c2a0e-0b7d-4c55-9a51-2f1f6c0d0001', 'CAN-BOADA',
        'Casal Cívic i Comunitari Terrassa – Can Boada', 'Terrassa', NULL, 1, '{}',
        '2026-10-14T00:00:00.000Z', '2026-10-14T00:00:00.000Z');

INSERT OR IGNORE INTO cicles (id, casal_id, nom, any, data_inici, data_fi, obertura_inscripcions,
  tancament_inscripcions, data_resolucio_prevista, estat, configuracio_formulari, creat_el, actualitzat_el)
VALUES ('7a2d3b1f-1c8e-4d66-8b62-3a2a7d1e0001', '6f1c2a0e-0b7d-4c55-9a51-2f1f6c0d0001',
        'Cicle de prova (fictici)', 2027, '2027-01-11', '2027-03-26',
        '2026-10-01T07:00:00.000Z', '2026-12-31T22:59:59.000Z', '2027-01-08',
        'inscripcions_obertes', '{}', '2026-10-14T00:00:00.000Z', '2026-10-14T00:00:00.000Z');

INSERT OR IGNORE INTO activitats (id, casal_id, cicle_id, nom, descripcio, categoria, dies_setmana,
  hora_inici, hora_fi, data_inici, data_fi, capacitat, nombre_sessions, estat, creat_el, actualitzat_el)
VALUES
 ('8b3e4c20-2d9f-4e77-9c73-4b3b8e2f0001', '6f1c2a0e-0b7d-4c55-9a51-2f1f6c0d0001', '7a2d3b1f-1c8e-4d66-8b62-3a2a7d1e0001',
  'Activitat de prova A', 'Descripció fictícia de prova.', 'Benestar', '[1,3]', '10:00', '11:30',
  '2027-01-11', '2027-03-24', 15, 22, 'activa', '2026-10-14T00:00:00.000Z', '2026-10-14T00:00:00.000Z'),
 ('8b3e4c20-2d9f-4e77-9c73-4b3b8e2f0002', '6f1c2a0e-0b7d-4c55-9a51-2f1f6c0d0001', '7a2d3b1f-1c8e-4d66-8b62-3a2a7d1e0001',
  'Activitat de prova B', NULL, 'Cultura', '[2]', '17:00', '18:30',
  '2027-01-12', '2027-03-23', 12, 11, 'activa', '2026-10-14T00:00:00.000Z', '2026-10-14T00:00:00.000Z'),
 ('8b3e4c20-2d9f-4e77-9c73-4b3b8e2f0003', '6f1c2a0e-0b7d-4c55-9a51-2f1f6c0d0001', '7a2d3b1f-1c8e-4d66-8b62-3a2a7d1e0001',
  'Activitat en esborrany (no pública)', NULL, 'Cultura', '[4]', '18:00', '19:00',
  NULL, NULL, 10, NULL, 'esborrany', '2026-10-14T00:00:00.000Z', '2026-10-14T00:00:00.000Z');
