export function followSystemTheme({query,meta}){
  const update=()=>{meta?.setAttribute('content',query.matches?'#0b0d14':'#f5f6fa');};
  update();query.addEventListener('change',update);
  return ()=>query.removeEventListener('change',update);
}
