-- Migració 0007: accés al panell de gestió.
-- No es desen contrasenyes ni tokens en clar: només el resum SHA-256 dels testimonis.

-- Testimonis d'accés d'un sol ús (autenticació de desenvolupament i de proves).
-- Els genera una persona administradora amb `scripts/acces-dev.mjs`; caduquen aviat.
CREATE TABLE testimonis_acces (
  resum        TEXT PRIMARY KEY,               -- SHA-256 en hexadecimal
  usuari_id    TEXT NOT NULL REFERENCES usuaris(id),
  creat_el     TEXT NOT NULL,
  caduca_el    TEXT NOT NULL,
  usat_el      TEXT
);

-- Sessions del panell. La galeta del navegador conté un valor aleatori;
-- aquí només se'n desa el resum.
CREATE TABLE sessions_usuari (
  resum          TEXT PRIMARY KEY,
  usuari_id      TEXT NOT NULL REFERENCES usuaris(id),
  creada_el      TEXT NOT NULL,
  caduca_el      TEXT NOT NULL,
  darrer_us_el   TEXT NOT NULL,
  revocada_el    TEXT
);

CREATE INDEX idx_sessions_usuari ON sessions_usuari (usuari_id) WHERE revocada_el IS NULL;
