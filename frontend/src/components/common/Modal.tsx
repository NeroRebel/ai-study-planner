import { useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { resolveReducedMotion, useUiPreferences } from "../../state/uiPreferences";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
  closeDisabled = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [visible, setVisible] = useState(true);
  const systemReduced = useReducedMotion();
  const preferences = useUiPreferences();
  const reduceMotion = resolveReducedMotion(preferences.motion, !!systemReduced);
  const requestClose = () => { if (!closeDisabled) setVisible(false); };
  useEffect(() => {
    const dialog = ref.current;
    const origin = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      origin?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={"prototype-modal " + (wide ? "modal-wide" : "")}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <AnimatePresence onExitComplete={onClose}>
      {visible && <motion.div key="backdrop" className="modal-backdrop" aria-hidden="true"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.18 }} onClick={requestClose} />}
      {visible && <motion.div key="panel" className="modal-panel"
        initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
        transition={{ duration: reduceMotion ? 0 : 0.22 }}>
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          type="button"
          onClick={requestClose}
          disabled={closeDisabled}
          aria-label="Close dialog"
        >
          <X size={19} />
        </button>
      </div>
      <div className="modal-content">{children}</div>
      </motion.div>}
      </AnimatePresence>
    </dialog>
  );
}
