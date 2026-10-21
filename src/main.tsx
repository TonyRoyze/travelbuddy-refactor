import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { router, queryClient } from "@/app/router";
import { SessionProvider } from "@/features/auth/session";
import "@/app/styles.css";
import { ThemeProvider } from "@/app/theme";
import { CartProvider } from "@/features/bookings/cart-provider";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider><SessionProvider>
        <CartProvider>
          <RouterProvider router={router} />
        </CartProvider>
      </SessionProvider></ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
