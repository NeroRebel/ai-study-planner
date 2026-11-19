import type { CSSProperties } from "react";
import type { SubjectColor } from "../types";
// Retain API hex values while keeping the approved muted surfaces and readable text.
export function subjectColorStyle(color: SubjectColor): CSSProperties {
  return color?.startsWith("#") ? {
    "--tone-fill": color, "--tone-bg": color + "15", "--tone-text": "var(--text)",
  } as CSSProperties : {};
}
