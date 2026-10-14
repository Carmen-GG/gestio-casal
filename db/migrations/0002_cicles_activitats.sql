-- Migració 0002: cicles i activitats (entitats compartides pels mòduls
-- Inscripcions i PG-Cartells).

CREATE TABLE cicles (
  id                         TEXT PRIMARY KEY,
  casal_id                   TEXT NOT NULL REFERENCES casals(id),
  nom                        TEXT NOT NULL CHECK (length(trim(nom)) > 0),
  any                        INTEGER NOT NULL CHECK (any BETWEEN 2000 AND 2100),
  data_inici                 TEXT NOT NULL,   -- data (AAAA-MM-DD)
  data_fi                    TEXT NOT NULL,
  obertura_inscripcions      TEXT NOT NULL,   -- data i hora ISO UTC
  tancament_inscripcions     TEXT NOT NULL,
  data_resolucio_prevista    TEXT NOT NULL,   -- data (AAAA-MM-DD), es mostra a la confirmació pública
  estat                      TEXT NOT NULL DEFAULT 'esborrany'
                             CHECK (estat IN ('esborrany', 'preparacio', 'inscripcions_obertes',
                                              'inscripcions_tancades', 'adjudicacio_en_proces',
                                              'adjudicat', 'publicat', 'finalitzat', 'arxivat')),
  -- Quins camps personals es demanen i quins són obligatoris (minimització de dades).
  configuracio_formulari     TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(configuracio_formulari)),
  -- Versió per al bloqueig optimista: cada modificació la incrementa.
  versio                     INTEGER NOT NULL DEFAULT 1 CHECK (versio >= 1),
  -- Identificador aleatori de la darrera escriptura; permet condicionar l'historial
  -- i l'auditoria del mateix lot a que aquella escriptura concreta hagi tingut efecte.
  darrera_operacio           TEXT,
  creat_el                   TEXT NOT NULL,
  actualitzat_el             TEXT NOT NULL,
  UNIQUE (id, casal_id),
  CHECK (data_fi >= data_inici),
  CHECK (tancament_inscripcions > obertura_inscripcions)
);

CREATE INDEX idx_cicles_casal_estat ON cicles (casal_id, estat);

CREATE TABLE activitats (
  id                   TEXT PRIMARY KEY,
  casal_id             TEXT NOT NULL,
  cicle_id             TEXT NOT NULL,
  nom                  TEXT NOT NULL CHECK (length(trim(nom)) > 0),
  descripcio           TEXT,
  categoria            TEXT,
  -- Dies de la setmana com a llista JSON de números ISO (1 = dilluns ... 7 = diumenge).
  dies_setmana         TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(dies_setmana)),
  hora_inici           TEXT CHECK (hora_inici IS NULL OR hora_inici GLOB '[0-2][0-9]:[0-5][0-9]'),
  hora_fi              TEXT CHECK (hora_fi IS NULL OR hora_fi GLOB '[0-2][0-9]:[0-5][0-9]'),
  horari_text          TEXT,            -- text lliure quan l'horari no és regular
  data_inici           TEXT,
  data_fi              TEXT,
  espai                TEXT,
  capacitat            INTEGER NOT NULL CHECK (capacitat >= 0),
  nombre_sessions      INTEGER CHECK (nombre_sessions IS NULL OR nombre_sessions >= 0),
  estat                TEXT NOT NULL DEFAULT 'esborrany'
                       CHECK (estat IN ('esborrany', 'activa', 'inactiva', 'arxivada')),
  -- Informació pública de difusió (text per a cartells, etc.). Mai dades personals.
  informacio_difusio   TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(informacio_difusio)),
  -- Configuració de continuïtat específica de l'activitat (regles validades al cicle).
  configuracio_continuitat TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(configuracio_continuitat)),
  codi_extern          TEXT,            -- identificador a PGEc o al sistema d'origen, si n'hi ha
  versio               INTEGER NOT NULL DEFAULT 1 CHECK (versio >= 1),
  darrera_operacio     TEXT,
  creat_el             TEXT NOT NULL,
  actualitzat_el       TEXT NOT NULL,
  FOREIGN KEY (cicle_id, casal_id) REFERENCES cicles (id, casal_id),
  UNIQUE (id, cicle_id),
  UNIQUE (id, casal_id),
  CHECK (data_inici IS NULL OR data_fi IS NULL OR data_fi >= data_inici),
  CHECK (hora_inici IS NULL OR hora_fi IS NULL OR hora_fi > hora_inici)
);

CREATE INDEX idx_activitats_cicle_estat ON activitats (cicle_id, estat);
CREATE UNIQUE INDEX uq_activitats_codi_extern ON activitats (cicle_id, codi_extern)
  WHERE codi_extern IS NOT NULL;

-- Historial de canvis genèric (qui, quan, què i per què) de qualsevol entitat.
-- Taula només d'addició: no es pot modificar ni esborrar.
-- Atenció: els canvis de dades personals poden contenir dades personals; l'accés
-- a aquesta taula està restringit pels mateixos permisos que l'entitat original.
CREATE TABLE historial_canvis (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  casal_id      TEXT NOT NULL REFERENCES casals(id),
  entitat       TEXT NOT NULL,
  entitat_id    TEXT NOT NULL,
  accio         TEXT NOT NULL CHECK (accio IN ('creacio', 'modificacio', 'canvi_estat', 'arxivat', 'duplicacio', 'importacio')),
  canvis        TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(canvis)),
  usuari_id     TEXT REFERENCES usuaris(id),
  motiu         TEXT,
  creat_el      TEXT NOT NULL
);

CREATE INDEX idx_historial_entitat ON historial_canvis (entitat, entitat_id, creat_el);

CREATE TRIGGER trg_historial_no_update BEFORE UPDATE ON historial_canvis
BEGIN SELECT RAISE(ABORT, 'historial_inalterable'); END;
CREATE TRIGGER trg_historial_no_delete BEFORE DELETE ON historial_canvis
BEGIN SELECT RAISE(ABORT, 'historial_inalterable'); END;
