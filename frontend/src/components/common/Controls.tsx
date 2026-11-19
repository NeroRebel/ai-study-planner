import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { motion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import { LoaderCircle } from "lucide-react";

export function Button({ variant = "secondary", loading = false, children, disabled, ...props }:
  Omit<HTMLMotionProps<"button">, "children"> & { children?: ReactNode; variant?: "primary" | "secondary" | "ghost" | "subtle" | "destructive"; loading?: boolean }) {
  return <motion.button {...props} className={`button button-${variant} ${props.className || ""}`}
    type={props.type || "button"} disabled={disabled || loading} aria-busy={loading || undefined}
    whileTap={disabled || loading ? undefined : { scale: 0.98 }}>
    {loading && <LoaderCircle size={15} className="control-loading" aria-hidden="true" />}{children}
  </motion.button>;
}

/** Styled native inputs retain Space, form submission and screen-reader semantics. */
export function CheckControl({ kind = "checkbox", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { kind?: "checkbox" | "switch" }) {
  return <input {...props} type="checkbox" role={kind === "switch" ? "switch" : undefined}
    className={`check-control ${kind === "switch" ? "switch-control" : ""} ${props.className || ""}`} />;
}

export function Toggle({ label, description, checked, onChange, disabled = false }: {
  label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  return <div className="preference-row"><div><label htmlFor={id}><strong>{label}</strong></label>{description && <small id={id + "-help"}>{description}</small>}</div>
    <CheckControl id={id} kind="switch" checked={checked} disabled={disabled} aria-describedby={description ? id + "-help" : undefined}
      onChange={event => onChange(event.target.checked)} /></div>;
}

export function SegmentedControl<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  const id = useId();
  return <fieldset className="segmented-field"><legend>{label}</legend><div className="segmented-control">
    {options.map(option => <label key={option.value} className={option.value === value ? "is-selected" : ""}>
      <input type="radio" name={id} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
      {value === option.value && <motion.span className="segment-indicator" layoutId={id} transition={{ duration: 0.16 }} aria-hidden="true" />}
      <span>{option.label}</span>
    </label>)}
  </div></fieldset>;
}
