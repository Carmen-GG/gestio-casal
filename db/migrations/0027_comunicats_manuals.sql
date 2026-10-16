-- Comunicats amb el WhatsApp normal (petició de 2026-10-16): sense WhatsApp Business, cada
-- missatge l'envia una persona des del seu WhatsApp (l'aplicació l'obre amb el text escrit).
-- manual = 1: no l'envia el servidor; queda pendent fins que la persona el marca com a enviat.
ALTER TABLE comunicats_destinataris ADD COLUMN manual INTEGER NOT NULL DEFAULT 0 CHECK (manual IN (0, 1));
