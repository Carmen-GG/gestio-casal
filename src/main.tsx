import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Disseny } from "./components/Disseny";
import { Inici } from "./pages/Inici";
import { CiclesPublics } from "./pages/CiclesPublics";
import { ActivitatsCicle } from "./pages/ActivitatsCicle";
import { NoTrobada } from "./pages/NoTrobada";
import "./styles.css";

const router = createBrowserRouter([
  {
    element: <Disseny />,
    children: [
      { path: "/", element: <Inici /> },
      { path: "/inscripcio/:codiCasal", element: <CiclesPublics /> },
      { path: "/inscripcio/:codiCasal/:cicleId", element: <ActivitatsCicle /> },
      { path: "*", element: <NoTrobada /> },
    ],
  },
]);

createRoot(document.getElementById("arrel")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
