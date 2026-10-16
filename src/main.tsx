import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Disseny } from "./components/Disseny";
import { Inici } from "./pages/Inici";
import { CiclesPublics } from "./pages/CiclesPublics";
import { ActivitatsCicle } from "./pages/ActivitatsCicle";
import { NoTrobada } from "./pages/NoTrobada";
import { Entrar } from "./pages/gestio/Entrar";
import { GestioDisseny } from "./pages/gestio/GestioDisseny";
import { GestioInici } from "./pages/gestio/GestioInici";
import { Compte } from "./pages/gestio/Compte";
import { AnarASeccio } from "./pages/gestio/AnarASeccio";
import { Properament } from "./pages/gestio/Properament";
import { CasalCicles } from "./pages/gestio/CasalCicles";
import { DetallCicle } from "./pages/gestio/DetallCicle";
import { Usuaris } from "./pages/gestio/Usuaris";
import { DetallSollicitud } from "./pages/gestio/DetallSollicitud";
import { DetallAdjudicacio } from "./pages/gestio/DetallAdjudicacio";
import { AssistenciaActivitat } from "./pages/gestio/AssistenciaActivitat";
import { ImprimirGraelles } from "./pages/gestio/ImprimirGraelles";
import { Comunicacions } from "./pages/gestio/Comunicacions";
import { ComunicacionsGenerals } from "./pages/gestio/ComunicacionsGenerals";
import { AssistenciaCicle } from "./pages/gestio/AssistenciaCicle";
import { WhatsappBusiness } from "./pages/gestio/WhatsappBusiness";
import { BuscarUsuari } from "./pages/gestio/BuscarUsuari";
import { AdministracioCasal, Responsables } from "./pages/gestio/Administracio";
import { ComunicatsCasals } from "./pages/gestio/ComunicatsCasals";
import { QuadreGlobal } from "./pages/gestio/QuadreGlobal";
import { FitxaPersona } from "./pages/gestio/FitxaPersona";
import { PantallaSorteig } from "./pages/gestio/PantallaSorteig";
import { CartellsInici } from "./pages/cartells/CartellsInici";
import { Plantilles } from "./pages/cartells/Plantilles";
import { DetallPlantilla } from "./pages/cartells/DetallPlantilla";
import { NouMaterial } from "./pages/cartells/NouMaterial";
import { Fototeca } from "./pages/cartells/Fototeca";
import { Instagram } from "./pages/instagram/Instagram";
import { DetallPublicacio } from "./pages/instagram/DetallPublicacio";
import { Territori } from "./pages/gestio/Territori";
import { Incidencies } from "./pages/gestio/Incidencies";
import "./styles.css";

const router = createBrowserRouter([
  {
    element: <Disseny />,
    children: [
      { path: "/", element: <Inici /> },
      { path: "/inscripcio/:codiCasal", element: <CiclesPublics /> },
      { path: "/inscripcio/:codiCasal/:cicleId", element: <ActivitatsCicle /> },
      { path: "/gestio/entrar", element: <Entrar /> },
      {
        path: "/gestio",
        element: <GestioDisseny />,
        children: [
          { index: true, element: <GestioInici /> },
          { path: "compte", element: <Compte /> },
          { path: "administracio/responsables", element: <Responsables /> },
          { path: "administracio/casal", element: <AdministracioCasal /> },
          { path: "administracio/quadre", element: <QuadreGlobal /> },
          { path: "administracio/comunicats", element: <ComunicatsCasals /> },
          { path: "administracio/territori", element: <Territori /> },
          { path: ":casalId", element: <CasalCicles /> },
          { path: ":casalId/cicles/:cicleId", element: <DetallCicle /> },
          { path: ":casalId/anar/:seccio", element: <AnarASeccio /> },
          { path: ":casalId/properament/:clau", element: <Properament /> },
          { path: ":casalId/cicles/:cicleId/sorteig", element: <PantallaSorteig /> },
          { path: ":casalId/usuaris", element: <Usuaris /> },
          { path: ":casalId/sollicituds/:sollicitudId", element: <DetallSollicitud /> },
          { path: ":casalId/adjudicacions/:execucioId", element: <DetallAdjudicacio /> },
          { path: ":casalId/activitats/:activitatId/assistencia", element: <AssistenciaActivitat /> },
          { path: ":casalId/cicles/:cicleId/graelles", element: <ImprimirGraelles /> },
          { path: ":casalId/cicles/:cicleId/comunicacions", element: <Comunicacions /> },
          { path: ":casalId/cicles/:cicleId/comunicacions-generals", element: <ComunicacionsGenerals /> },
          { path: ":casalId/cicles/:cicleId/assistencia", element: <AssistenciaCicle /> },
          { path: ":casalId/whatsapp", element: <WhatsappBusiness /> },
          { path: ":casalId/incidencies", element: <Incidencies /> },
          { path: ":casalId/persones", element: <BuscarUsuari /> },
          { path: ":casalId/persones/:personaId", element: <FitxaPersona /> },
          { path: ":casalId/cartells", element: <CartellsInici /> },
          { path: ":casalId/cartells/plantilles", element: <Plantilles /> },
          { path: ":casalId/cartells/plantilles/:plantillaId", element: <DetallPlantilla /> },
          { path: ":casalId/cartells/nou", element: <NouMaterial /> },
          { path: ":casalId/cartells/fotos", element: <Fototeca /> },
          { path: ":casalId/instagram", element: <Instagram /> },
          { path: ":casalId/instagram/:publicacioId", element: <DetallPublicacio /> },
        ],
      },
      { path: "*", element: <NoTrobada /> },
    ],
  },
]);

createRoot(document.getElementById("arrel")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
