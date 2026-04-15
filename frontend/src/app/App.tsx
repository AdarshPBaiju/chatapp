import { RouterProvider } from "react-router-dom";

import { appRouter } from "@/app/router";
import { useAuthBootstrap } from "@/app/bootstrap";

export function App() {
  const ready = useAuthBootstrap();

  if (!ready) {
    return <div className="container"><p>Initializing auth...</p></div>;
  }

  return <RouterProvider router={appRouter} />;
}
