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
import { CasalCicles } from "./pages/gestio/CasalCicles";
import { DetallCicle } from "./pages/gestio/DetallCicle";
import { Usuaris } from "./pages/gestio/Usuaris";
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
          { path: ":casalId", element: <CasalCicles /> },
          { path: ":casalId/cicles/:cicleId", element: <DetallCicle /> },
          { path: ":casalId/usuaris", element: <Usuaris /> },
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
