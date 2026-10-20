import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Where the server is and how to reach it; kept in this browser only. */
export interface Settings {
  /** Server origin, such as `https://bop.example.com`; empty means this page's origin. */
  apiBase: string;
  /** Bearer token for servers started with `BOP_API_TOKEN`. */
  token: string;
  set: (patch: Partial<Pick<Settings, "apiBase" | "token">>) => void;
}

const fallback = (import.meta.env.VITE_BOP_API_BASE as string | undefined) ?? "";

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      apiBase: fallback,
      token: "",
      set: (patch) => set(patch),
    }),
    {
      name: "bop-studio.settings",
      storage: createJSONStorage(() => localStorage),
      partialize: ({ apiBase, token }) => ({ apiBase, token }),
    },
  ),
);
