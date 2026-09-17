import { createContext, useContext, useState, type ReactNode } from "react";
import type { RecurringRule } from "@/domain/types";
import type { Occurrence } from "@/domain/occurrences";

type CaptureMode = "expense" | "income" | "transfer";

/** Confirming a planned bill/income into a real transaction ("Mark as paid"). */
export interface ConfirmPayload {
  rule: RecurringRule;
  occurrence: Occurrence;
}

interface CaptureContextValue {
  open: boolean;
  mode: CaptureMode;
  editingId: string | null;
  confirm: ConfirmPayload | null;
  openCapture: (mode?: CaptureMode) => void;
  openEditor: (id: string) => void;
  openConfirm: (rule: RecurringRule, occurrence: Occurrence) => void;
  close: () => void;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CaptureMode>("expense");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmPayload | null>(null);

  const openCapture = (m: CaptureMode = "expense") => {
    setMode(m);
    setEditingId(null);
    setConfirm(null);
    setOpen(true);
  };
  const openEditor = (id: string) => {
    setEditingId(id);
    setConfirm(null);
    setOpen(true);
  };
  const openConfirm = (rule: RecurringRule, occurrence: Occurrence) => {
    setConfirm({ rule, occurrence });
    setEditingId(null);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setConfirm(null);
  };

  return (
    <CaptureContext.Provider
      value={{ open, mode, editingId, confirm, openCapture, openEditor, openConfirm, close }}
    >
      {children}
    </CaptureContext.Provider>
  );
}

export function useCapture(): CaptureContextValue {
  const ctx = useContext(CaptureContext);
  if (!ctx) throw new Error("useCapture must be used within CaptureProvider");
  return ctx;
}
