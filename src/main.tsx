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
import { PantallaSorteig } from "./pages/gestio/PantallaSorteig";
import { CartellsInici } from "./pages/cartells/CartellsInici";
import { Plantilles } from "./pages/cartells/Plantilles";
import { DetallPlantilla } from "./pages/cartells/DetallPlantilla";
import { NouMaterial } from "./pages/cartells/NouMaterial";
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
          { path: ":casalId/cartells", element: <CartellsInici /> },
          { path: ":casalId/cartells/plantilles", element: <Plantilles /> },
          { path: ":casalId/cartells/plantilles/:plantillaId", element: <DetallPlantilla /> },
          { path: ":casalId/cartells/nou", element: <NouMaterial /> },
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
