import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { SearchResultsCard } from '@/components/SearchResultsCard';

export function installSearchCarouselMotionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host=document.createElement('div');host.id='arc-search-carousel-qa';
  Object.assign(host.style,{position:'fixed',inset:'0',zIndex:'100',overflow:'auto',padding:'12px',background:'hsl(var(--background))'});
  document.body.append(host);const root=createRoot(host);
  const images=['#175',' #357','#735','#573'].map((color,i)=>`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><rect width="640" height="400" fill="${color.trim()}"/><text x="250" y="220" fill="white" font-size="80">${i+1}</text></svg>`)}`);
  const render=(count=4)=>flushSync(()=>root.render(<SearchResultsCard query="Synthetic search" content={"A fixture answer.\n\n| Item | Value |\n| --- | --- |\n| Test | Yes |"} sources={[{url:'https://example.com',title:'Fixture source'}]} images={images.slice(0,count)} />));
  render();return {render,dispose:()=>{flushSync(()=>root.unmount());host.remove();}};
}
