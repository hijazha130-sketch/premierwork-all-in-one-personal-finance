import { createContext, useContext, useState, type ReactNode } from "react";

type CaptureMode = "expense" | "income" | "transfer";

interface CaptureContextValue {
  open: boolean;
  mode: CaptureMode;
  editingId: string | null;
  openCapture: (mode?: CaptureMode) => void;
  openEditor: (id: string) => void;
  close: () => void;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CaptureMode>("expense");
  const [editingId, setEditingId] = useState<string | null>(null);

  const openCapture = (m: CaptureMode = "expense") => {
    setMode(m);
    setEditingId(null);
    setOpen(true);
  };
  const openEditor = (id: string) => {
    setEditingId(id);
    setOpen(true);
  };
  const close = () => setOpen(false);

  return (
    <CaptureContext.Provider value={{ open, mode, editingId, openCapture, openEditor, close }}>
      {children}
    </CaptureContext.Provider>
  );
}

export function useCapture(): CaptureContextValue {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error("useCapture must be used within CaptureProvider");
  return ctx;
}
