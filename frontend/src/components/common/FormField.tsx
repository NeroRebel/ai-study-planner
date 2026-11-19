import type { ReactNode } from "react";
import { cloneElement, isValidElement, useId } from "react";
export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const control = isValidElement<{ id?: string; "aria-describedby"?: string }>(children) ? children : null;
  const controlId = control?.props.id || id;
  const description = [control?.props["aria-describedby"], hint ? id + "-hint" : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="form-field">
      <label htmlFor={controlId}>{label}</label>
      {control ? cloneElement(control, { id: controlId, "aria-describedby": description }) : children}
      {hint && <small id={id + "-hint"}>{hint}</small>}
    </div>
  );
}
