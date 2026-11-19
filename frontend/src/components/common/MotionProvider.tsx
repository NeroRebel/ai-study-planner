import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { useUiPreferences } from "../../state/uiPreferences";

/** One motion policy for the app, including auth and native dialog contents. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const { motion } = useUiPreferences();
  return <MotionConfig reducedMotion={motion === "system" ? "user" : motion === "reduced" ? "always" : "never"} transition={{ duration: 0.2, ease: "easeOut" }}>
    {children}
  </MotionConfig>;
}
