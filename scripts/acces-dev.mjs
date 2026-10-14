#!/usr/bin/env node
/**
 * Crea (si cal) una persona autoritzada, li assigna un rol i genera un enllaç
 * d'accés d'un sol ús al panell de gestió. NOMÉS per als entorns local i staging:
 * a producció l'accés s'ha de fer amb el proveïdor d'identitat corporatiu.
 *
 * Ús:
 *   node scripts/acces-dev.mjs --email persona@exemple.cat --nom "Nom" --rol gestor_casal --casal CAN-BOADA
 *   node scripts/acces-dev.mjs --email admin@exemple.cat --nom "Admin" --rol admin_central
 *   Opcions: --entorn local|staging (per defecte local) · --url https://... (base de l'enllaç)
 *            --minuts 30 (validesa de l'enllaç)
 *
 * L'enllaç porta el codi al fragment (#testimoni=...), que el navegador no envia al servidor.
 * A la base de dades només es desa el resum SHA-256 del codi.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith("--") ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []),
);
const entorn = args.entorn ?? "local";
if (!["local", "staging"].includes(entorn)) {
  console.error("Aquest script només es pot fer servir als entorns local i staging.");
  process.exit(1);
}
const { email, nom, rol } = args;
const casal = args.casal?.toUpperCase();
const ROLS_CASAL = ["gestor_casal", "consulta_casal", "difusio_casal"];
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !nom || !rol || (!ROLS_CASAL.includes(rol) && rol !== "admin_central")) {
  console.error("Cal indicar --email, --nom i --rol (gestor_casal, consulta_casal, difusio_casal o admin_central).");
  process.exit(1);
}
if (ROLS_CASAL.includes(rol) && !/^[A-Z0-9-]{2,40}$/.test(casal ?? "")) {
  console.error("Per a un rol de casal cal --casal amb el codi del casal (p. ex. CAN-BOADA).");
  process.exit(1);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const ara = new Date();
const minuts = Math.min(Math.max(Number(args.minuts ?? 30), 5), 24 * 60);
const testimoni = randomBytes(32).toString("base64url");
const resum = createHash("sha256").update(testimoni).digest("hex");
const usuariId = randomUUID();
const isoAra = ara.toISOString();
const caduca = new Date(ara.getTime() + minuts * 60_000).toISOString();
const correu = email.toLowerCase();
const casalSql = rol === "admin_central" ? "NULL" : `(SELECT id FROM casals WHERE codi = ${q(casal)})`;

const sql = `
INSERT INTO usuaris (id, email, nom_visible, proveidor_identitat, actiu, creat_el, actualitzat_el)
  SELECT ${q(usuariId)}, ${q(correu)}, ${q(nom)}, 'dev', 1, ${q(isoAra)}, ${q(isoAra)}
  WHERE NOT EXISTS (SELECT 1 FROM usuaris WHERE email = ${q(correu)});
INSERT INTO assignacions_rols (id, usuari_id, rol_codi, casal_id, atorgat_el, motiu)
  SELECT ${q(randomUUID())}, u.id, ${q(rol)}, ${casalSql}, ${q(isoAra)}, 'Alta amb scripts/acces-dev.mjs'
  FROM usuaris u WHERE u.email = ${q(correu)}
  AND NOT EXISTS (SELECT 1 FROM assignacions_rols a WHERE a.usuari_id = u.id AND a.rol_codi = ${q(rol)}
                  AND ifnull(a.casal_id, '*') = ifnull(${casalSql}, '*') AND a.revocat_el IS NULL);
INSERT INTO testimonis_acces (resum, usuari_id, creat_el, caduca_el)
  SELECT ${q(resum)}, id, ${q(isoAra)}, ${q(caduca)} FROM usuaris WHERE email = ${q(correu)};
INSERT INTO registres_auditoria (creat_el, casal_id, usuari_id, tipus_operacio, entitat, entitat_id, resultat, detalls)
  SELECT ${q(isoAra)}, ${casalSql}, NULL, 'manteniment.acces_dev', 'usuari', id, 'exit', ${q(JSON.stringify({ rol }))}
  FROM usuaris WHERE email = ${q(correu)};
`;

if (rol !== "admin_central") {
  const comprova = execFileSync("npx", ["wrangler", "d1", "execute", "DB", entorn === "local" ? "--local" : "--remote",
    ...(entorn === "staging" ? ["--env", "staging"] : []), "--json", "--command", `SELECT id FROM casals WHERE codi = ${q(casal)}`],
    { encoding: "utf8", shell: process.platform === "win32" });
  if (!JSON.parse(comprova)[0]?.results?.length) {
    console.error(`No existeix cap casal amb el codi ${casal}.`);
    process.exit(1);
  }
}

execFileSync("npx", ["wrangler", "d1", "execute", "DB", entorn === "local" ? "--local" : "--remote",
  ...(entorn === "staging" ? ["--env", "staging"] : []), "--command", sql],
  { stdio: ["ignore", "ignore", "inherit"], shell: process.platform === "win32" });

const base = (args.url ?? "http://localhost:5173").replace(/\/$/, "");
console.log(`\nEnllaç d'accés per a ${nom} (vàlid ${minuts} minuts, un sol ús):\n\n  ${base}/gestio/entrar#testimoni=${testimoni}\n`);
