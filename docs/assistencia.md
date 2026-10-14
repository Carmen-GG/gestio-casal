# Control d'assistència

Funcionament del registre d'assistència (Fase 6) i regles que cal validar institucionalment.

## Sessions
- Cada activitat té les seves sessions. Es poden **generar** a partir dels dies de la setmana i de les dates d'inici i fi de l'activitat (màxim 200 d'un cop), o **afegir** una a una. La generació no duplica cap sessió existent (mateixa data i hora).
- Si l'activitat no té dates, cal afegir les sessions a mà.
- Una sessió prevista i sense marques es pot **cancel·lar** amb un motiu (per exemple, un festiu). No s'esborra: queda com a cancel·lada.
- Les sessions es poden crear o cancel·lar des que el cicle és en preparació fins que està publicat (no en esborrany, finalitzat ni arxivat).

## Registre
- L'assistència es registra quan el cicle està **adjudicat** o **publicat**, i només per a sessions d'avui o anteriors (hora de Madrid).
- Hi ha tres marques: **present**, **absent** i **absència justificada**.
- Apareixen les persones amb plaça admesa a l'activitat i, a més, les que ja tenien marques encara que hagin perdut la plaça (per conservar-ne l'historial).
- Una marca nova es desa directament. **Modificar** una marca ja desada exigeix un motiu i queda a l'historial de la plaça amb l'estat anterior, el nou, la persona usuària i la data.
- Tot el registre d'una sessió es desa en una sola transacció. Si una altra persona ha desat canvis al mateix temps, no es desa res i cal tornar a carregar.

## Percentatge i llindar
- Percentatge = presències / (presències + absències). Les absències justificades no compten.
- Només es calcula a partir de **3 sessions** computables, per no assenyalar ningú amb dades insuficients.
- Cada cicle pot tenir un **llindar** (1–100 %). Les persones per sota apareixen marcades al resum.
- **El llindar no comporta cap acció automàtica.** Cap baixa ni pèrdua de plaça es fa sense una regla oficial validada i una acció explícita d'una persona autoritzada (des de «Places i llistes d'espera», amb motiu).

## Graelles i exportacions
- **Graelles XLSX**: un full per activitat, amb la capçalera de l'activitat, les persones admeses per ordre alfabètic, una columna per sessió (o columnes en blanc si encara no hi ha sessions, per escriure-hi la data a mà) i, separada a sota, la llista d'espera per ordre de posició. Format per imprimir en A4 (horitzontal si hi ha moltes columnes).
- El telèfon només s'hi inclou si es demana i la persona usuària té permís per veure dades de contacte (es comprova al servidor).
- El fitxer es valida abans de lliurar-lo (s'obre i es comprova que hi ha totes les persones de la base de dades).
- Els canvis fets en un full imprès o descarregat no es traslladen sols: cal registrar-los a l'aplicació.
- Totes les exportacions queden a l'auditoria.

## Pendent de validar
- Si hi ha un llindar oficial d'assistència i quin és.
- Quines conseqüències té quedar-hi per sota i qui les decideix.
- Si cal un mínim de sessions diferent de 3 per calcular el percentatge.
