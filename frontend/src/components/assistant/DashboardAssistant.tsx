import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { AssistantPanel } from "./AssistantPanel";
import { Modal } from "../common/Modal";
import { resolveReducedMotion, useUiPreferences } from "../../state/uiPreferences";

export function DashboardAssistant({ docked, hidden, overlayOpen, onClose }: {
  docked: boolean; hidden: boolean; overlayOpen: boolean; onClose: () => void;
}) {
  const preferences = useUiPreferences();
  const systemReduced = useReducedMotion();
  const reduced = resolveReducedMotion(preferences.motion, !!systemReduced);
  if (!docked) return overlayOpen ? <Modal title="Study assistant" onClose={onClose}>
    <div className="assistant-overlay"><AssistantPanel full /></div>
  </Modal> : null;
  return <motion.div className="dashboard-assistant" inert={hidden} aria-hidden={hidden || undefined} initial={false} animate={{ width: hidden ? 0 : 316 }}
    transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}>
    <AnimatePresence initial={false}>{!hidden && <motion.div key="assistant-dock" className="assistant-panel-shell"
      initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.14 }}><AssistantPanel onClose={onClose} /></motion.div>}</AnimatePresence>
  </motion.div>;
}
