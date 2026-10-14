# Qüestions pendents de validació institucional

L'ús de Cloudflare **no** implica l'aprovació institucional del tractament de dades personals.
Abans d'introduir dades reals cal que el responsable del tractament i el delegat de protecció
de dades (DPD) validin, com a mínim:

## Protecció de dades (RGPD i LOPDGDD)
- Responsable del tractament, finalitat i base jurídica de les inscripcions.
- Inscripció al registre d'activitats de tractament.
- Text de la informació de privacitat del formulari (no n'hi ha prou amb un avís genèric). El panell
  permet desar-lo per a cada cicle; mentre sigui buit, el formulari públic no accepta sol·licituds.
  Es desa la data d'acceptació i un resum (SHA-256) del text exacte acceptat. El text de les dades de
  prova és fictici i no és vàlid.
- Llista definitiva de camps personals que es poden recollir (minimització). El formulari
  permet activar-ne o desactivar-ne cadascun; per defecte només nom i primer cognom són obligatoris.
- Justificació, si escau, per recollir DNI/NIE, data de naixement o lloc de naixement.
- Terminis de conservació i procediment de supressió o anonimització.
- Procediment per atendre drets d'accés, rectificació, supressió, oposició i limitació.
- Necessitat d'una avaluació d'impacte (AIPD).
- Política de drets d'imatge per a les fotografies del mòdul PG-Cartells.

## Proveïdor i ubicació de les dades
- Contracte d'encàrrec del tractament amb Cloudflare (DPA) i condicions de transferències internacionals.
- Jurisdicció de D1 i R2 (opció de jurisdicció UE) i ubicació de les còpies de seguretat.
- Contractació del servei (compte institucional, pla, facturació).

## Seguretat i ENS
- Categoria del sistema segons l'Esquema Nacional de Seguretat i mesures aplicables.
- Sistema d'identitat corporatiu (p. ex. Microsoft Entra ID) i responsable d'altes i baixes.
- Política de registres (logs) i de retenció dels registres d'auditoria.
- Procediment de còpies de seguretat i proves de restauració.

## Regles de negoci
- Regles d'adjudicació: el casal va indicar la seva regla el 14/10/2026 (llista d'espera anterior, preferència i sorteig per activitat). Està implementada com a valors per defecte configurables; cal deixar-la per escrit i validar el criteri per reconèixer la mateixa persona entre cicles ([adjudicacio.md](adjudicacio.md)).
- Mínim de participants per activitat (habitualment 15 adults, 8 infantil i juvenil): només genera avisos.
- Llindar d'assistència i conseqüències: el llindar és configurable per cicle i només serveix per identificar persones. L'aplicació no aplica cap baixa ni pèrdua de plaça automàtica; si hi ha una regla oficial, es fa amb una acció explícita (vegeu [assistencia.md](assistencia.md)).
