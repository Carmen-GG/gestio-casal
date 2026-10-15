-- Superadministració i responsables de casal (petició de 2026-10-15).
-- - La superadministració (rol global admin_central) veu tots els casals i assigna a cada
--   casal la persona responsable. En un casal que ja té responsable, només hi pot consultar
--   (ho aplica el servidor: worker/auth/permisos.ts); si no en té, el gestiona com a responsable.
-- - La persona responsable gestiona el seu casal i les persones del seu equip (altes i baixes).
-- - Primer accés: codi d'un sol ús que es lliura a la persona; amb el seu correu i el codi
--   crea la contrasenya. Es desa a testimonis_acces amb tipus 'primer_acces' (només el resum).
UPDATE rols SET nom = 'Superadministració',
  descripcio = 'Veu tots els casals i el quadre de comandament global, i assigna les persones responsables de cada casal.'
WHERE codi = 'admin_central';

INSERT INTO rols (codi, nom, descripcio, abast) VALUES
  ('responsable_casal', 'Responsable del casal', 'Gestiona el casal i les persones del seu equip (altes i baixes).', 'casal');

INSERT INTO rols_permisos (rol_codi, permis_codi)
SELECT 'responsable_casal', codi FROM permisos
WHERE modul = 'inscripcions'
   OR codi IN ('casal.consultar', 'casal.configurar', 'usuaris.gestionar', 'auditoria.consultar',
               'cartells.consultar', 'cartells.crear', 'cartells.generar', 'cartells.fotografies');

ALTER TABLE testimonis_acces ADD COLUMN tipus TEXT NOT NULL DEFAULT 'acces' CHECK (tipus IN ('acces', 'primer_acces'));
CREATE INDEX idx_testimonis_usuari ON testimonis_acces (usuari_id) WHERE usat_el IS NULL;
