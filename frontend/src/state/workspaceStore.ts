import type { AppApi } from '../api';
import type { ImportMode, ImportPreview, ImportResult, WorkspaceCounts, WorkspaceDocument } from '../api/workspace';
import { ApiError, errorMessage } from '../api/client';

export const MAX_WORKSPACE_BYTES = 2 * 1024 * 1024;
export const totalRecords = (counts: WorkspaceCounts) => Object.values(counts).reduce((sum, count) => sum + count, 0);
export interface WorkspaceSnapshot {
  busy: 'reading' | 'export' | 'preview' | 'apply' | 'refresh' | null;
  mode: ImportMode; fileName: string; preview: ImportPreview | null; confirmation: string;
  error: string; message: string; refreshFailed: boolean;
}
const initial = (): WorkspaceSnapshot => ({busy:null,mode:'MERGE',fileName:'',preview:null,confirmation:'',error:'',message:'',refreshFailed:false});

export async function readWorkspaceFile(file: Pick<File, 'size' | 'arrayBuffer'>): Promise<string> {
  if (!file.size || file.size > MAX_WORKSPACE_BYTES) throw new ApiError('Choose a non-empty JSON file up to 2 MB.');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength > MAX_WORKSPACE_BYTES) throw new ApiError('Choose a non-empty JSON file up to 2 MB.');
  const text = new TextDecoder('utf-8', {fatal:true}).decode(bytes);
  if (!text.trim() || new TextEncoder().encode(text).length > MAX_WORKSPACE_BYTES) throw new ApiError('Choose a non-empty JSON file up to 2 MB.');
  return text; // Keep exact content; backend detects duplicate keys and validates every row.
}

export function downloadWorkspace(document: WorkspaceDocument) {
  const blob = new Blob([JSON.stringify(document)], {type:'application/json'});
  const url = URL.createObjectURL(blob), link = window.document.createElement('a');
  try {
    link.href = url; link.download = 'ai-study-planner-workspace-' + document.exported_at.slice(0,10) + '.json';
    window.document.body.append(link); link.click();
  } finally { link.remove(); URL.revokeObjectURL(url); }
}

/** Raw file/preview live only in this account-keyed provider, never localStorage. */
export function createWorkspaceStore(api: AppApi['workspace'], refresh: () => Promise<unknown>, download=downloadWorkspace) {
  let snapshot=initial(), content='', disposed=false;
  const listeners=new Set<()=>void>();
  function publish(change: Partial<WorkspaceSnapshot>) { if(!disposed){snapshot={...snapshot,...change};listeners.forEach(fn=>fn());} }
  async function refreshSaved() {
    try { await refresh(); if(!disposed)publish({refreshFailed:false}); }
    catch { publish({refreshFailed:true,error:'Import saved, but planner data could not be refreshed. Retry loading data; do not import again.'}); }
  }
  return {
    getSnapshot:()=>snapshot, subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
    setMode(mode: ImportMode){if(snapshot.busy||disposed)return;publish({mode,preview:null,confirmation:'',error:'',message:''});},
    setConfirmation(confirmation: string){if(!snapshot.busy)publish({confirmation});},
    cancel(){if(snapshot.busy||disposed)return;content='';publish(initial());},
    async selectFile(file: File){
      if(snapshot.busy||disposed)return;content='';publish({busy:'reading',fileName:'',preview:null,confirmation:'',error:'',message:''});
      try { const value=await readWorkspaceFile(file); if(!disposed){content=value;publish({fileName:file.name});} }
      catch(error){publish({error:error instanceof ApiError?error.message:'The file could not be read. Choose a UTF-8 JSON file.'});}
      finally{publish({busy:null});}
    },
    async export(){
      if(snapshot.busy||disposed)return;publish({busy:'export',error:'',message:''});
      try {const value=await api.export();if(!disposed){download(value);publish({message:'Workspace export downloaded. Keep your backup private.'});}}
      catch(error){publish({error:errorMessage(error)});}finally{publish({busy:null});}
    },
    async preview(){
      if(snapshot.busy||disposed)return;
      if(!content){publish({error:'Choose a workspace JSON file first.'});return;}
      publish({busy:'preview',preview:null,confirmation:'',error:'',message:''});
      try {const preview=await api.preview({mode:snapshot.mode,content});publish({preview});}
      catch(error){publish({error:errorMessage(error)});}finally{publish({busy:null});}
    },
    async apply(){
      const preview=snapshot.preview;
      if(snapshot.busy||disposed||!preview?.can_apply)return;
      if(preview.mode==='REPLACE'&&snapshot.confirmation!=='REPLACE'){publish({error:'Type REPLACE to confirm replacing your planner data.'});return;}
      publish({busy:'apply',error:'',message:''});
      try {
        const result: ImportResult=await api.apply({mode:preview.mode,content,evaluated_at:preview.evaluated_at,
          fingerprint:preview.fingerprint,confirmation:preview.mode==='REPLACE'?'REPLACE':''});
        if(disposed)return;
        content='';publish({preview:null,fileName:'',confirmation:'',message:`Workspace imported: ${totalRecords(result.imported)} records added. ${result.conflicts_skipped} conflicting rows skipped.`});
        await refreshSaved(); // A refresh failure must never repeat a committed import.
      } catch(error){
        publish({error:errorMessage(error),preview:null,confirmation:''});
      } finally{publish({busy:null});}
    },
    async retryRefresh(){if(snapshot.busy||disposed)return;publish({busy:'refresh',error:''});try{await refreshSaved();}finally{publish({busy:null});}},
    dispose(){disposed=true;content='';snapshot=initial();listeners.clear();},
  };
}
export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;
