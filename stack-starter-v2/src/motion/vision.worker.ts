import type { VisionRequest, VisionResponse, VisionConfig, BlobCandidate, ColorSpec } from '../shared/vision-worker';

// Dynamic official UMD/WASM API is confined to this file; messages stay strictly typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CvApi = any;
const scope = self as unknown as DedicatedWorkerGlobalScope & {cv?:CvApi};
let cv:CvApi, config:VisionConfig, generation=0, configVersion=0;
let mats:CvApi[]=[];
let canvas:OffscreenCanvas;
let context:OffscreenCanvasRenderingContext2D;
let rgba:CvApi,rgb:CvApi,hsv:CvApi,mask:CvApi,temp:CvApi,low:CvApi,high:CvApi,labels:CvApi,stats:CvApi,centroids:CvApi,kernel:CvApi;
const send=(message:VisionResponse)=>scope.postMessage(message);
function dispose(){for(const mat of mats)mat.delete();mats=[];}
function configure(next:VisionConfig){
  if(!Number.isInteger(next.width) || !Number.isInteger(next.height) || next.width<16 || next.height<16 || next.width>1280 || next.height>720 ||
    !Number.isFinite(next.minAreaPx) || next.minAreaPx<1 || !Number.isFinite(next.maxAreaRatio) || next.maxAreaRatio<=0 || next.maxAreaRatio>1 ||
    next.colors.length!==2 || next.colors[0].id!=='anchor' || next.colors[1].id!=='guide' || next.colors.some(c=>
      ![c.hueDeg,c.halfWidthDeg,c.saturationMin,c.valueMin].every(Number.isFinite) || c.hueDeg<0 || c.hueDeg>=360 ||
      c.halfWidthDeg<=0 || c.halfWidthDeg>=90 || c.saturationMin<0 || c.saturationMin>1 || c.valueMin<0 || c.valueMin>1))throw new Error('Invalid vision configuration');
  dispose();config=next;
  const {width:w,height:h}=config;
  canvas=new OffscreenCanvas(w,h);
  context=canvas.getContext('2d',{willReadFrequently:true})!;
  rgba=new cv.Mat(h,w,cv.CV_8UC4);rgb=new cv.Mat(h,w,cv.CV_8UC3);hsv=new cv.Mat(h,w,cv.CV_8UC3);
  mask=new cv.Mat(h,w,cv.CV_8UC1);temp=new cv.Mat(h,w,cv.CV_8UC1);
  low=new cv.Mat(h,w,cv.CV_8UC3);high=new cv.Mat(h,w,cv.CV_8UC3);
  labels=new cv.Mat();stats=new cv.Mat();centroids=new cv.Mat();kernel=cv.Mat.ones(3,3,cv.CV_8U);
  mats=[rgba,rgb,hsv,mask,temp,low,high,labels,stats,centroids,kernel];
}
function detect(spec:ColorSpec):BlobCandidate[]{
  const h=spec.hueDeg/2, span=spec.halfWidthDeg/2;
  const threshold=(a:number,b:number,target:CvApi)=>{
    low.setTo(new cv.Scalar(Math.max(0,Math.floor(a)),Math.round(spec.saturationMin*255),Math.round(spec.valueMin*255),0));
    high.setTo(new cv.Scalar(Math.min(179,Math.ceil(b)),255,255,0));
    cv.inRange(hsv,low,high,target);
  };
  if(h-span<0){threshold(0,h+span,mask);threshold(h-span+180,179,temp);cv.bitwise_or(mask,temp,mask);}
  else if(h+span>179){threshold(h-span,179,mask);threshold(0,h+span-180,temp);cv.bitwise_or(mask,temp,mask);}
  else threshold(h-span,h+span,mask);
  cv.morphologyEx(mask,mask,cv.MORPH_OPEN,kernel);
  const count=cv.connectedComponentsWithStats(mask,labels,stats,centroids,8,cv.CV_32S);
  const found:BlobCandidate[]=[];
  for(let i=1;i<count;i++){
    const area=stats.intAt(i,cv.CC_STAT_AREA);
    if(area<config.minAreaPx || area>config.width*config.height*config.maxAreaRatio)continue;
    found.push({areaPx:area,cx:centroids.doubleAt(i,0),cy:centroids.doubleAt(i,1),x:stats.intAt(i,cv.CC_STAT_LEFT),y:stats.intAt(i,cv.CC_STAT_TOP),width:stats.intAt(i,cv.CC_STAT_WIDTH),height:stats.intAt(i,cv.CC_STAT_HEIGHT)});
  }
  return found.sort((a,b)=>b.areaPx-a.areaPx).slice(0,10);
}
scope.onmessage=async(event:MessageEvent<VisionRequest>)=>{
  const message=event.data;
  if(message.kind==='INIT'){
    generation=message.generation;configVersion=message.configVersion;
    try{
      importScripts(message.opencvUrl);
      cv=scope.cv;
      // This official build returns a self-resolving Emscripten thenable.
      // Resolve our promise with void, never with the runtime object itself.
      await new Promise<void>((resolve,reject)=>{
        if(cv?.calledRun && cv?.Mat){resolve();return;}
        if(typeof cv?.then==='function')cv.then(()=>resolve());
        else reject(new Error('Unsupported OpenCV runtime loader'));
      });
      if(!cv?.Mat)throw new Error('OpenCV runtime is not ready');
      configure(message.config);
      send({kind:'READY',protocol:'1.0',generation,configVersion,opencvVersion:'4.13.0'});
    }catch(error){send({kind:'ERROR',generation,code:'INIT_FAILED',message:String(error)});}
  }else if(message.kind==='CONFIG'){
    if(message.generation!==generation)return;
    try{configure(message.config);configVersion=message.configVersion;send({kind:'CONFIGURED',generation,configVersion});}
    catch(error){send({kind:'ERROR',generation,code:'BAD_CONFIG',message:String(error)});}
  }else if(message.kind==='FRAME'){
    const started=performance.now();
    try{
      if(message.token.generation!==generation || message.token.configVersion!==configVersion) return;
      context.drawImage(message.bitmap,0,0,config.width,config.height);
      rgba.data.set(context.getImageData(0,0,config.width,config.height).data);
      cv.cvtColor(rgba,rgb,cv.COLOR_RGBA2RGB);cv.cvtColor(rgb,hsv,cv.COLOR_RGB2HSV);
      const [a,b]=config.colors;
      const anchor=detect(a);
      const sameColor=a.hueDeg===b.hueDeg && a.halfWidthDeg===b.halfWidthDeg && a.saturationMin===b.saturationMin && a.valueMin===b.valueMin;
      const candidates={anchor,guide:sameColor?anchor:detect(b)};
      send({kind:'RESULT',token:message.token,processingMs:performance.now()-started,candidates});
    }catch(error){send({kind:'ERROR',generation,frameId:message.token.frameId,code:'FRAME_FAILED',message:String(error)});}
    finally{message.bitmap.close();}
  }else if(message.kind==='STOP'){
    if(message.generation!==generation)return;
    dispose();send({kind:'STOPPED',generation});scope.close();
  }
};
