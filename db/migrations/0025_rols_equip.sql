-- Rols de l'equip del casal (petició de 2026-10-16): només dos.
-- - Responsable del casal: administra tot el que es pot gestionar al casal.
-- - Conserge: només «Gestionar assistència» (veure les activitats, passar llista i imprimir les graelles).
-- Les assignacions antigues (gestió, consulta, difusió) no es toquen: continuen funcionant
-- fins que la persona responsable les revoqui, però ja no se'n poden donar de noves.
UPDATE rols SET descripcio = 'Administra tot el que es pot gestionar al casal, inclòs el seu equip.' WHERE codi = 'responsable_casal';
INSERT OR IGNORE INTO rols_permisos (rol_codi, permis_codi) VALUES ('responsable_casal', 'cartells.configurar');

INSERT INTO rols (codi, nom, descripcio, abast) VALUES
  ('conserge', 'Conserge', 'Només gestiona l''assistència: passa llista a les activitats i imprimeix les graelles.', 'casal');
INSERT INTO rols_permisos (rol_codi, permis_codi) VALUES
  ('conserge', 'casal.consultar'),
  ('conserge', 'cicles.consultar'),
  ('conserge', 'activitats.consultar'),
  ('conserge', 'assistencia.registrar');
