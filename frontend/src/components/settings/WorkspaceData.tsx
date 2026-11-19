import { useContext, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Download, Upload } from 'lucide-react';
import { AppDataContext } from '../../state/AppDataContext';
import type { ImportPreview, WorkspaceCounts } from '../../api/workspace';
import { totalRecords } from '../../state/workspaceStore';
import { Button, SegmentedControl } from '../common/Controls';
import { Feedback } from '../common/Feedback';
import { FormField } from '../common/FormField';

const labels: Record<keyof WorkspaceCounts,string> = {subjects:'Subjects',tasks:'Tasks',availability:'Availability windows',study_sessions:'Study sessions'};

export function WorkspacePreview({preview}:{preview:ImportPreview}) {
  return <div className="workspace-preview">
    <h3>Review {preview.mode === 'MERGE' ? 'Merge' : 'Replace'} import</h3>
    <dl className="workspace-counts">{(Object.keys(labels) as (keyof WorkspaceCounts)[]).map(key=><div key={key}><dt>{labels[key]}</dt><dd>{preview.additions[key]}</dd></div>)}</dl>
    <p className="form-note">{totalRecords(preview.duplicates)} duplicate records will be reused or skipped. {preview.conflicts.length} conflicts. {preview.invalid_rows.length} invalid rows.</p>
    {preview.mode === 'REPLACE'&&<Feedback tone="warning">This removes {totalRecords(preview.existing)} existing planner records, including study history. Your profile, preferences and sign-in details stay unchanged.</Feedback>}
    {preview.warnings.map((warning,index)=><p className="form-note" key={index}>{warning}</p>)}
    {([['Conflicts',preview.conflicts],['Invalid rows',preview.invalid_rows]] as const).map(([title,issues])=>issues.length>0&&<details key={title} className="workspace-issues" open={title==='Invalid rows'}>
      <summary>{title} ({issues.length})</summary><ul>{issues.map((issue,index)=><li key={index}><strong>{labels[issue.entity]} · row {issue.row}</strong><span>{issue.message}</span></li>)}</ul>
    </details>)}
    {!preview.can_apply&&<Feedback tone="error">Nothing will be imported until all invalid rows are fixed. Choose the corrected file and preview it again.</Feedback>}
    {preview.can_apply&&preview.mode==='MERGE'&&totalRecords(preview.additions)===0&&<Feedback tone="success">All records are already present or conflict with existing records. There is nothing new to import.</Feedback>}
  </div>;
}

export function WorkspaceData() {
  const context=useContext(AppDataContext);
  const input=useRef<HTMLInputElement>(null);
  // Lightweight component previews may omit account-bound services.
  if(!context?.workspace||!context.workspaceStore)return null;
  const {workspace,workspaceStore,pending}=context;
  const busy=Boolean(workspace.busy)||pending;
  const preview=workspace.preview;
  const applicable=preview?.can_apply&&(preview.mode==='REPLACE'||totalRecords(preview.additions)>0);
  return <div className="workspace-controls" aria-busy={Boolean(workspace.busy)}>
    <p className="form-note">Back up or transfer planner records as JSON. Profile, preferences, account credentials and avatars are not included. Keep downloaded files private.</p>
    <div className="header-actions"><Button disabled={busy} loading={workspace.busy==='export'} onClick={()=>{void workspaceStore.export();}}><Download size={15}/>Export workspace</Button>
      <Button disabled={busy} onClick={()=>input.current?.click()}><Upload size={15}/>Choose JSON file</Button></div>
    <input ref={input} type="file" accept=".json,application/json" hidden aria-label="Import workspace JSON file" onChange={event=>{
      const file=event.target.files?.[0];event.target.value='';if(file)void workspaceStore.selectFile(file);
    }}/>
    <p className="form-note" role="status">{workspace.fileName?`Selected: ${workspace.fileName}`:'Import workspace · JSON files up to 2 MB.'}</p>
    {workspace.fileName&&<fieldset disabled={busy} className="workspace-import-options"><legend className="sr-only">Import options</legend>
      <SegmentedControl label="Import mode" value={workspace.mode} options={[{value:'MERGE',label:'Merge'},{value:'REPLACE',label:'Replace'}]} onChange={mode=>workspaceStore.setMode(mode)}/>
      <p className="form-note">{workspace.mode==='MERGE'?'Keep existing data; reuse duplicates and skip conflicts.':'Replace only your planner data. This includes existing study history.'}</p>
      <Button disabled={busy} loading={workspace.busy==='preview'} onClick={()=>{void workspaceStore.preview();}}>Preview import</Button>
    </fieldset>}
    <AnimatePresence mode="wait">{preview&&<motion.div key={preview.fingerprint} initial={{opacity:0,y:5}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{duration:0.18}}>
      <WorkspacePreview preview={preview}/>
      {preview.mode==='REPLACE'&&preview.can_apply&&<FormField label="Type REPLACE to confirm" hint="This replaces your planner records only. Export a backup first."><input disabled={busy} autoComplete="off" spellCheck={false} value={workspace.confirmation} onChange={event=>workspaceStore.setConfirmation(event.target.value)}/></FormField>}
      <div className="header-actions"><Button disabled={busy} onClick={()=>workspaceStore.cancel()}>Cancel import</Button>
        <Button variant={preview.mode==='REPLACE'?'destructive':'primary'} loading={workspace.busy==='apply'} disabled={busy||!applicable||(preview.mode==='REPLACE'&&workspace.confirmation!=='REPLACE')} onClick={()=>{void workspaceStore.apply();}}>Import workspace</Button></div>
    </motion.div>}</AnimatePresence>
    {workspace.error&&<Feedback tone="error">{workspace.error}</Feedback>}
    {workspace.message&&<Feedback tone="success">{workspace.message}</Feedback>}
    {workspace.refreshFailed&&<Button disabled={busy} loading={workspace.busy==='refresh'} onClick={()=>{void workspaceStore.retryRefresh();}}>Retry loading planner data</Button>}
  </div>;
}
