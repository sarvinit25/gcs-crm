import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./lib/auth";
import { PartnerAuthProvider } from "./lib/partner-auth";
import { BorrowerAuthProvider } from "./lib/borrower-auth";
import { router } from "./router";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PartnerAuthProvider>
          <BorrowerAuthProvider>
            <RouterProvider router={router} />
          </BorrowerAuthProvider>
        </PartnerAuthProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
