-- Migració 0001: nucli organitzatiu compartit per tots els mòduls.
-- Casals, usuaris autoritzats, rols, permisos i assignacions per casal.
-- Convencions:
--   * Identificadors TEXT (UUID v4 generats al servidor), no seqüencials ni deduïbles.
--   * Dates i hores en TEXT ISO 8601 UTC (p. ex. 2026-10-14T11:00:00.000Z).
--   * Booleans com INTEGER 0/1 amb CHECK.
--   * Configuracions en TEXT JSON validat amb json_valid().

CREATE TABLE casals (
  id              TEXT PRIMARY KEY,
  codi            TEXT NOT NULL UNIQUE
                  CHECK (length(codi) BETWEEN 2 AND 40 AND codi NOT GLOB '*[^A-Z0-9-]*'),
  nom             TEXT NOT NULL CHECK (length(trim(nom)) > 0),
  municipi        TEXT NOT NULL CHECK (length(trim(municipi)) > 0),
  adreca          TEXT,
  actiu           INTEGER NOT NULL DEFAULT 1 CHECK (actiu IN (0, 1)),
  configuracio    TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(configuracio)),
  versio          INTEGER NOT NULL DEFAULT 1 CHECK (versio >= 1),
  darrera_operacio TEXT,
  creat_el        TEXT NOT NULL,
  actualitzat_el  TEXT NOT NULL
);

-- Persones autoritzades a accedir al panell de gestió.
-- No s'hi desen contrasenyes: l'autenticació es delega a un proveïdor
-- d'identitat (desenvolupament o Microsoft Entra ID en el futur).
CREATE TABLE usuaris (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nom_visible           TEXT NOT NULL,
  proveidor_identitat   TEXT NOT NULL CHECK (proveidor_identitat IN ('dev', 'entra_id')),
  subjecte_extern       TEXT,
  actiu                 INTEGER NOT NULL DEFAULT 1 CHECK (actiu IN (0, 1)),
  creat_el              TEXT NOT NULL,
  actualitzat_el        TEXT NOT NULL,
  darrer_acces_el       TEXT,
  UNIQUE (proveidor_identitat, subjecte_extern)
);

-- Catàleg de rols i permisos (dades de referència, no personals).
CREATE TABLE rols (
  codi        TEXT PRIMARY KEY,
  nom         TEXT NOT NULL,
  descripcio  TEXT NOT NULL,
  abast       TEXT NOT NULL CHECK (abast IN ('casal', 'global'))
);

CREATE TABLE permisos (
  codi        TEXT PRIMARY KEY,
  modul       TEXT NOT NULL CHECK (modul IN ('plataforma', 'inscripcions', 'cartells')),
  descripcio  TEXT NOT NULL
);

CREATE TABLE rols_permisos (
  rol_codi    TEXT NOT NULL REFERENCES rols(codi),
  permis_codi TEXT NOT NULL REFERENCES permisos(codi),
  PRIMARY KEY (rol_codi, permis_codi)
);

-- Assignació d'un rol a un usuari. Els rols d'abast 'casal' requereixen casal_id;
-- els d'abast 'global' (administració central) no en tenen.
-- Les assignacions no s'esborren: es revoquen (revocat_el) per conservar la traçabilitat.
CREATE TABLE assignacions_rols (
  id            TEXT PRIMARY KEY,
  usuari_id     TEXT NOT NULL REFERENCES usuaris(id),
  rol_codi      TEXT NOT NULL REFERENCES rols(codi),
  casal_id      TEXT REFERENCES casals(id),
  atorgat_per   TEXT REFERENCES usuaris(id),
  atorgat_el    TEXT NOT NULL,
  revocat_per   TEXT REFERENCES usuaris(id),
  revocat_el    TEXT,
  motiu         TEXT
);

CREATE INDEX idx_assignacions_usuari ON assignacions_rols (usuari_id) WHERE revocat_el IS NULL;
CREATE INDEX idx_assignacions_casal ON assignacions_rols (casal_id) WHERE revocat_el IS NULL;
-- Evita assignar dues vegades el mateix rol vigent al mateix usuari i casal.
CREATE UNIQUE INDEX uq_assignacio_vigent
  ON assignacions_rols (usuari_id, rol_codi, ifnull(casal_id, '*'))
  WHERE revocat_el IS NULL;

-- Coherència entre l'abast del rol i la presència de casal_id.
CREATE TRIGGER trg_assignacio_abast_insert
BEFORE INSERT ON assignacions_rols
BEGIN
  SELECT RAISE(ABORT, 'assignacio_abast_incoherent')
  WHERE ((SELECT abast FROM rols WHERE codi = NEW.rol_codi) = 'casal' AND NEW.casal_id IS NULL)
     OR ((SELECT abast FROM rols WHERE codi = NEW.rol_codi) = 'global' AND NEW.casal_id IS NOT NULL);
END;

INSERT INTO rols (codi, nom, descripcio, abast) VALUES
  ('gestor_casal',      'Gestió del casal',        'Gestiona cicles, activitats, sol·licituds, adjudicacions i assistència del casal assignat.', 'casal'),
  ('consulta_casal',    'Consulta del casal',      'Consulta les dades del casal assignat sense modificar-les.', 'casal'),
  ('difusio_casal',     'Difusió del casal',       'Crea materials de difusió (PG-Cartells) del casal assignat.', 'casal'),
  ('admin_central',     'Administració central',   'Permisos ampliats sobre tots els casals. Només s''habilita amb autorització expressa.', 'global');

INSERT INTO permisos (codi, modul, descripcio) VALUES
  ('casal.consultar',            'plataforma',   'Consultar les dades i la configuració del casal'),
  ('casal.configurar',           'plataforma',   'Modificar la configuració del casal'),
  ('usuaris.gestionar',          'plataforma',   'Assignar i revocar rols'),
  ('auditoria.consultar',        'plataforma',   'Consultar els registres d''auditoria'),
  ('cicles.consultar',           'inscripcions', 'Consultar cicles'),
  ('cicles.gestionar',           'inscripcions', 'Crear i modificar cicles i canviar-ne l''estat'),
  ('activitats.consultar',       'inscripcions', 'Consultar activitats'),
  ('activitats.gestionar',       'inscripcions', 'Crear, editar, duplicar i arxivar activitats'),
  ('sollicituds.consultar',      'inscripcions', 'Consultar sol·licituds'),
  ('sollicituds.dades_contacte', 'inscripcions', 'Veure telèfon i correu electrònic de les persones sol·licitants'),
  ('sollicituds.gestionar',      'inscripcions', 'Modificar sol·licituds de manera controlada'),
  ('dades.importar',             'inscripcions', 'Importar dades des de CSV o Excel'),
  ('dades.exportar',             'inscripcions', 'Exportar dades autoritzades'),
  ('adjudicacio.executar',       'inscripcions', 'Configurar i executar propostes d''adjudicació'),
  ('adjudicacio.confirmar',      'inscripcions', 'Confirmar i publicar una adjudicació'),
  ('places.gestionar',           'inscripcions', 'Gestionar places, renúncies i llistes d''espera'),
  ('assistencia.registrar',      'inscripcions', 'Registrar i modificar l''assistència'),
  ('estadistiques.consultar',    'inscripcions', 'Consultar el quadre de comandament'),
  ('cartells.consultar',         'cartells',     'Consultar plantilles i materials'),
  ('cartells.crear',             'cartells',     'Crear i modificar continguts de difusió'),
  ('cartells.generar',           'cartells',     'Generar cartells PDF i imatges'),
  ('cartells.fotografies',       'cartells',     'Pujar i gestionar fotografies'),
  ('cartells.recursos_comuns',   'cartells',     'Gestionar recursos institucionals comuns'),
  ('cartells.plantilles',        'cartells',     'Administrar plantilles'),
  ('cartells.configurar',        'cartells',     'Administrar la configuració del mòdul PG-Cartells');

-- gestor_casal: tot el mòdul d'inscripcions del seu casal + consulta de cartells.
INSERT INTO rols_permisos (rol_codi, permis_codi)
SELECT 'gestor_casal', codi FROM permisos
WHERE modul = 'inscripcions' OR codi IN ('casal.consultar', 'cartells.consultar');

INSERT INTO rols_permisos (rol_codi, permis_codi)
SELECT 'consulta_casal', codi FROM permisos
WHERE codi IN ('casal.consultar', 'cicles.consultar', 'activitats.consultar',
               'sollicituds.consultar', 'estadistiques.consultar', 'cartells.consultar');

INSERT INTO rols_permisos (rol_codi, permis_codi)
SELECT 'difusio_casal', codi FROM permisos
WHERE codi IN ('casal.consultar', 'cicles.consultar', 'activitats.consultar',
               'cartells.consultar', 'cartells.crear', 'cartells.generar', 'cartells.fotografies');

INSERT INTO rols_permisos (rol_codi, permis_codi)
SELECT 'admin_central', codi FROM permisos;
