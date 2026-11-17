import { useContext } from "react";
import { AppDataContext } from "../state/AppDataContext";
export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) throw new Error("AppDataProvider is required.");
  return context;
}
