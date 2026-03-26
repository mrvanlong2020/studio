import React, { createContext, useContext, useState } from "react";

export interface ViewerUser {
  id: number;
  name: string;
  role: string;
  roles: string[];
  isAdmin: boolean;
}

interface StaffAuthContextValue {
  viewer: ViewerUser | null;
  setViewer: (v: ViewerUser | null) => void;
  canViewProfile: (staffId: number) => boolean;
  isAdmin: boolean;
}

const StaffAuthContext = createContext<StaffAuthContextValue>({
  viewer: null,
  setViewer: () => {},
  canViewProfile: () => false,
  isAdmin: false,
});

const STORAGE_KEY = "amazingStudioViewer_v2";

function loadViewer(): ViewerUser | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s) as ViewerUser) : null;
  } catch { return null; }
}

export function StaffAuthProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewerState] = useState<ViewerUser | null>(loadViewer);

  const setViewer = (v: ViewerUser | null) => {
    setViewerState(v);
    if (v) localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    else localStorage.removeItem(STORAGE_KEY);
  };

  const isAdmin = Boolean(
    viewer && (viewer.role === "admin" || viewer.roles?.includes("admin"))
  );

  const canViewProfile = (staffId: number) =>
    isAdmin || (viewer?.id === staffId);

  return (
    <StaffAuthContext.Provider value={{ viewer, setViewer, canViewProfile, isAdmin }}>
      {children}
    </StaffAuthContext.Provider>
  );
}

export const useStaffAuth = () => useContext(StaffAuthContext);
