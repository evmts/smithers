import { createContext, useContext, type ReactNode } from "react";
import { useIterationTimeout } from "../hooks/useIterationTimeout";
import type { SmithersDB } from "smithers-orchestrator/db";

interface SmithersContextValue {
  db: SmithersDB;
  executionId: string;
  sleep: () => Promise<void>;
}

const SmithersContext = createContext<SmithersContextValue | null>(null);

interface SmithersProviderProps {
  children: ReactNode;
  db: SmithersDB;
  executionId: string;
  /**
   * Timeout in milliseconds between Ralph loop iterations.
   * Defaults to 10000ms (10 seconds).
   */
  iterationTimeout?: number;
}

/**
 * Provider that supplies Smithers context including database, execution ID,
 * and throttled sleep function for Ralph loop iterations.
 */
export function SmithersProvider({
  children,
  db,
  executionId,
  iterationTimeout
}: SmithersProviderProps): ReactNode {
  const { sleep } = useIterationTimeout(iterationTimeout);

  const contextValue: SmithersContextValue = {
    db,
    executionId,
    sleep
  };

  return (
    <SmithersContext.Provider value={contextValue}>
      {children}
    </SmithersContext.Provider>
  );
}

/**
 * Hook to access Smithers context.
 * Must be used within SmithersProvider.
 */
export function useSmithers(): SmithersContextValue {
  const context = useContext(SmithersContext);

  if (!context) {
    throw new Error("useSmithers must be used within SmithersProvider");
  }

  return context;
}