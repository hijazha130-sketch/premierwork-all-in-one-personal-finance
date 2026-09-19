import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/state/ThemeProvider";
import { DataProvider } from "@/state/DataProvider";
import { useData } from "@/state/dataContext";
import { CaptureProvider } from "@/state/CaptureProvider";
import { AppShell } from "@/components/AppShell";
import { Home } from "@/screens/Home";
import { Money } from "@/screens/Money";
import { Plan } from "@/screens/Plan";
import { WealthView } from "@/screens/WealthView";
import { More } from "@/screens/More";
import { Setup } from "@/screens/Setup";
import { Accounts } from "@/screens/manage/Accounts";
import { Groups } from "@/screens/manage/Groups";
import { People } from "@/screens/manage/People";

/** A calm first-paint state while the local database opens. */
function Booting() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-base">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-card bg-inset font-serif text-2xl text-gold">
          A
        </div>
        <p className="text-muted text-sm">Opening your money…</p>
      </div>
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { loading } = useData();
  if (loading) return <Booting />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <DataProvider>
        <CaptureProvider>
          <BrowserRouter>
            <Gate>
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<Home />} />
                  <Route path="money" element={<Money />} />
                  <Route path="plan" element={<Plan />} />
                  <Route path="grow" element={<WealthView />} />
                  <Route path="more" element={<More />} />
                  <Route path="setup" element={<Setup />} />
                  <Route path="accounts" element={<Accounts />} />
                  <Route path="groups" element={<Groups />} />
                  <Route path="people" element={<People />} />
                  <Route path="*" element={<Home />} />
                </Route>
              </Routes>
            </Gate>
          </BrowserRouter>
        </CaptureProvider>
      </DataProvider>
    </ThemeProvider>
  );
}
