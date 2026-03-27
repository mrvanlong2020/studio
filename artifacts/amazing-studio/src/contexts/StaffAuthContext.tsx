import React, { createContext, useContext, useState } from "react";

export interface ViewerUser {
  id: number;
  name: string;
  role: string;
  roles: string[];
  isAdmin: boolean;
}

export type ViewMode = "admin" | "staff";
export type SimulateRole = "photographer" | "makeup" | "photoshop" | "sale" | "assistant" | null;

interface StaffAuthContextValue {
  viewer: ViewerUser | null;
  setViewer: (v: ViewerUser | null) => void;
  canViewProfile: (staffId: number) => boolean;
  isAdmin: boolean;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  simulateRole: SimulateRole;
  setSimulateRole: (r: SimulateRole) => void;
  effectiveIsAdmin: boolean;
}

const StaffAuthContext = createContext<StaffAuthContextValue>({
  viewer: null,
  setViewer: () => {},
  canViewProfile: () => false,
  isAdmin: false,
  viewMode: "admin",
  setViewMode: () => {},
  simulateRole: null,
  setSimulateRole: () => {},
  effectiveIsAdmin: false,
});

const STORAGE_KEY = "amazingStudioViewer_v2";
const VIEW_MODE_KEY = "amazingStudioViewMode_v1";

function loadViewer(): ViewerUser | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s) as ViewerUser) : null;
  } catch { return null; }
}

function loadViewMode(): ViewMode {
  try {
    const s = localStorage.getItem(VIEW_MODE_KEY);
    return (s === "staff" ? "staff" : "admin") as ViewMode;
  } catch { return "admin"; }
}

export function StaffAuthProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewerState] = useState<ViewerUser | null>(loadViewer);
  const [viewMode, setViewModeState] = useState<ViewMode>(loadViewMode);
  const [simulateRole, setSimulateRoleState] = useState<SimulateRole>(null);

  const setViewer = (v: ViewerUser | null) => {
    setViewerState(v);
    if (v) localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    else localStorage.removeItem(STORAGE_KEY);
  };

  const setViewMode = (m: ViewMode) => {
    setViewModeState(m);
    localStorage.setItem(VIEW_MODE_KEY, m);
    if (m === "admin") setSimulateRoleState(null);
  };

  const setSimulateRole = (r: SimulateRole) => {
    setSimulateRoleState(r);
    if (r) setViewModeState("staff");
  };

  const isAdmin = Boolean(
    viewer && (viewer.role === "admin" || viewer.roles?.includes("admin"))
  );

  const effectiveIsAdmin = isAdmin && viewMode === "admin" && !simulateRole;

  const canViewProfile = (staffId: number) =>
    effectiveIsAdmin || (viewer?.id === staffId);

  return (
    <StaffAuthContext.Provider value={{
      viewer, setViewer, canViewProfile, isAdmin,
      viewMode, setViewMode, simulateRole, setSimulateRole, effectiveIsAdmin
    }}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export const useStaffAuth = () => useContext(StaffAuthContext);
