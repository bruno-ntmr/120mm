// X1-G SHDS profile: next-write pointer at 0, latest sequence at 8.
// Keep a full physical snapshot; checkpoints belong to a BLE device ID.
export function historyIndex(index) {
  if(index.length!==20)return null;
  const pointer=index[0],sequence=index[8]|index[9]<<8;
  return pointer<=100?{next:pointer%100,sequence}:null;
}
export async function readHistory(memory,index,previous,decode,progress=()=>{}) {
  const current=historyIndex(index);
  const read=async(start,count)=>{
    const bytes=await memory.read(0x2e8+start*14,count*14);
    return Array.from({length:count},(_,j)=>decode(bytes.slice(j*14,(j+1)*14),start+j));
  };
  const full=async()=>{
    const slots=[];
    for(let i=0;i<100;i+=4){slots.push(...await read(i,4));progress(10+(i+4)*.75);}
    return slots;
  };
  const old=previous?.index,slots=previous?.slots;
  if(!current||!old||!Array.isArray(slots)||slots.length!==100||
    !slots.every((r,i)=>r?.slot===i&&typeof r.hex==='string'&&r.hex.length===28)||
    !Number.isInteger(old.sequence)||!Number.isInteger(old.next)||old.next<0||old.next>99)return full();
  const delta=current.sequence-old.sequence;
  // Resets, sequence rollover and a completely overwritten ring use a full read.
  if(old.sequence===0||delta<0||delta>=100||(old.next+delta)%100!==current.next)return full();
  const anchor=(old.next+99)%100;
  const [actual]=await read(anchor,1);
  if(actual.empty||actual.sequence!==old.sequence||actual.hex!==slots[anchor].hex)return full();
  const updated=slots.slice();
  for(let done=0;done<delta;){
    const start=(old.next+done)%100,count=Math.min(4,delta-done,100-start);
    const rows=await read(start,count);
    if(rows.some((r,j)=>r.empty||r.sequence!==old.sequence+done+j+1))return full();
    updated.splice(start,count,...rows);done+=count;progress(10+75*done/delta);
  }
  progress(85);return updated;
}
