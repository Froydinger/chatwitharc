import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { LinksPanelView } from '@/components/LinksPanel';
import type { LinkList } from '@/store/useSearchStore';

export function installLinksPanelMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-links-panel-qa';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'100',background:'hsl(var(--background))'});
  document.body.append(host);const root=createRoot(host);const calls:{kind:string;id?:string;name?:string;linkId?:string}[]=[];
  function Fixture() {
    const [lists,setLists]=useState<LinkList[]>([{id:'default',name:'Saved',createdAt:0,links:[1,2].map(n=>({id:`link-${n}`,title:`Fixture link ${n}`,url:`fixture link ${n}`,savedAt:0,listId:'default'}))},{id:'custom',name:'Reading',createdAt:0,links:[]}]);
    return <LinksPanelView data={{lists,
      createList:name=>{const id=`created-${calls.length}`;calls.push({kind:'create',name,id});setLists(prev=>[...prev,{id,name,createdAt:0,links:[]}]);return id;},
      deleteList:id=>{calls.push({kind:'delete',id});setLists(prev=>prev.filter(l=>l.id!==id));},
      renameList:(id,name)=>{calls.push({kind:'rename',id,name});setLists(prev=>prev.map(l=>l.id===id?{...l,name}:l));},
      removeLink:(id,linkId)=>{calls.push({kind:'remove',id,linkId});setLists(prev=>prev.map(l=>l.id===id?{...l,links:l.links.filter(link=>link.id!==linkId)}:l));},
    }} />;
  }
  flushSync(()=>root.render(<Fixture />));return {calls,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
