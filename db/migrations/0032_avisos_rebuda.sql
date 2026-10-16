-- Migració 0032: avís de rebuda de la sol·licitud (petició de 2026-10-16).
-- Quan una persona envia el formulari, rep un avís que la sol·licitud s'ha rebut: per correu si
-- n'ha donat un, si no per WhatsApp (quan el casal té el WhatsApp Business actiu).
-- Aquí només es desa com ha anat cada avís. Cap adreça, telèfon ni text del missatge es desa:
-- es llegeixen de la sol·licitud en el moment d'enviar.

CREATE TABLE avisos_rebuda (
  sollicitud_id  TEXT PRIMARY KEY REFERENCES sollicituds (id) ON DELETE CASCADE,
  casal_id       TEXT NOT NULL REFERENCES casals (id),
  canal          TEXT NOT NULL CHECK (canal IN ('correu', 'whatsapp', 'cap')),
  estat          TEXT NOT NULL CHECK (estat IN ('enviat', 'fallit', 'no_enviable')),
  -- Per què no s'ha pogut enviar (sense_contacte, telefon_fix, servei_no_configurat, sense_whatsapp, error_servei).
  motiu          TEXT CHECK (motiu IS NULL OR length(motiu) <= 40),
  -- Identificador del missatge al servei (Resend o Meta), per seguir-ne l'entrega.
  extern_id      TEXT CHECK (extern_id IS NULL OR length(extern_id) <= 200),
  error_text     TEXT CHECK (error_text IS NULL OR length(error_text) <= 200),
  creat_el       TEXT NOT NULL
);

CREATE INDEX idx_avisos_rebuda_casal ON avisos_rebuda (casal_id, creat_el);
