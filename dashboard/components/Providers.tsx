"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { TimerProvider } from "@/contexts/TimerContext";
import { SSEProvider } from "@/contexts/SSEContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { VisualEffectsProvider } from "@/contexts/VisualEffectsContext";
import { Toaster } from "react-hot-toast";
import { SessionTimeoutManager } from "./SessionTimeoutManager";
import { ErrorBoundary } from "./ErrorBoundary";

interface ProvidersProps {
  children: ReactNode;
}

export default function Providers({ children }: ProvidersProps) {
  return (
    <ErrorBoundary>
      <SessionProvider>
        <ThemeProvider>
          <VisualEffectsProvider>
            <TimerProvider>
              <SSEProvider>
                <NotificationProvider>
                  <SessionTimeoutManager />
                  {children}
                  <Toaster
                    position="top-right"
                    toastOptions={{
                      duration: 4000,
                      style: {
                        background: '#1f2937',
                        color: '#fff',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                      },
                      success: {
                        iconTheme: {
                          primary: '#10b981',
                          secondary: '#fff',
                        },
                      },
                      error: {
                        iconTheme: {
                          primary: '#ef4444',
                          secondary: '#fff',
                        },
                      },
                    }}
                  />
                </NotificationProvider>
              </SSEProvider>
            </TimerProvider>
          </VisualEffectsProvider>
        </ThemeProvider>
      </SessionProvider>
    </ErrorBoundary>
  );
}
