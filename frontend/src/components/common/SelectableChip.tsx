import { motion } from 'motion/react';
import { Check, Plus } from 'lucide-react';

export function SelectableChip({label,selected,onChange,disabled=false}:{label:string;selected:boolean;onChange:()=>void;disabled?:boolean}) {
  return <motion.button type="button" className={'selectable-chip '+(selected?'is-selected':'')} aria-pressed={selected}
    disabled={disabled} onClick={onChange} whileTap={disabled?undefined:{scale:0.98}}>
    {selected?<Check size={15} aria-hidden="true"/>:<Plus size={15} aria-hidden="true"/>}<span>{label}</span>
  </motion.button>;
}
