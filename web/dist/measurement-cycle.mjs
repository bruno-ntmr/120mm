// A replayed result alone must never trigger another memory transfer.
export class MeasurementCycle {
  active=false;
  accept(kind){
    if(kind==='measuring')this.active=true;
    if(kind==='device_error')this.active=false;
    if(kind!=='result'||!this.active)return false;
    this.active=false;
    return true;
  }
}
