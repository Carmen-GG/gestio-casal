-- Contrasenya permanent per entrar al panell (decisió de 2026-10-15).
-- Només se'n desa el resum PBKDF2-SHA256 amb sal; mai la contrasenya.
ALTER TABLE usuaris ADD COLUMN contrasenya_resum TEXT;
ALTER TABLE usuaris ADD COLUMN contrasenya_canviada_el TEXT;
