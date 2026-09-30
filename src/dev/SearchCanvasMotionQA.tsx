import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {SearchCanvas} from '@/components/SearchCanvas';
import {SubscriptionProvider} from '@/hooks/useSubscription';
import {useSearchStore} from '@/store/useSearchStore';
export function installSearchCanvasMotionQA(){
 if(!import.meta.env.DEV)throw new Error('Local QA only');
 const backup=useSearchStore.getState();const storage=new Map(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)!]));
 const result={id:'qa-source',title:'Synthetic bicycle source',url:'https://example.com/bicycle',snippet:'Synthetic source text'};
 useSearchStore.setState({sessions:[{id:'qa-search',query:'Synthetic bicycle research',results:[result],formattedContent:'A synthetic research answer.',timestamp:Date.now()}],activeSessionId:'qa-search',pendingSearchQuery:null,isSearching:false,lists:[{id:'default',name:'Saved links',createdAt:Date.now(),links:[{id:'qa-link',title:'Synthetic saved link',url:'https://example.com/saved',savedAt:Date.now(),listId:'default'}]}],syncFromSupabase:async()=>{},closeSearch:()=>{}});
 const host=document.createElement('div');host.id='arc-search-canvas-qa';Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'10000',background:'hsl(var(--background))'});document.body.append(host);const root=createRoot(host);
 flushSync(()=>root.render(<SubscriptionProvider><SearchCanvas/></SubscriptionProvider>));
 return {pending:()=>useSearchStore.setState({sessions:[{...useSearchStore.getState().sessions[0],summaryConversation:[{id:'qa-followup',role:'user',content:'Synthetic follow-up',timestamp:Date.now()}]}]}),searching:(value:boolean)=>useSearchStore.setState({activeSessionId:value?null:"qa-search",isSearching:value}),dispose:()=>{flushSync(()=>root.unmount());host.remove();useSearchStore.setState(backup,true);localStorage.clear();for(const[key,value]of storage)localStorage.setItem(key,value);}};
}
