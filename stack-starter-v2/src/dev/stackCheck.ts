import Phaser from 'phaser';
import './stack.css';
import { PhysicsCheck } from '../game/PhysicsCheck';
import type { VisionConfig, VisionRequest, VisionResponse } from '../shared/vision-worker';

const game=new Phaser.Game({type:Phaser.WEBGL,parent:'game',width:760,height:480,backgroundColor:'#102f40',physics:{default:'matter',matter:{gravity:{x:0,y:0},autoUpdate:false}},scene:[PhysicsCheck]});
document.querySelector('#reset')!.addEventListener('click',()=>game.scene.getScene('PhysicsCheck').scene.restart());
const status=document.querySelector<HTMLElement>('#vision-status')!;
const result=document.querySelector<HTMLElement>('#vision-result')!;
const sample=document.querySelector<HTMLCanvasElement>('#sample')!;
const video=document.querySelector<HTMLVideoElement>('#video')!;
const ctx=sample.getContext('2d')!;
const config:VisionConfig={width:320,height:240,colors:[{id:'anchor',hueDeg:180,halfWidthDeg:18,saturationMin:0.4,valueMin:0.25},{id:'guide',hueDeg:300,halfWidthDeg:18,saturationMin:0.4,valueMin:0.25}],minAreaPx:50,maxAreaRatio:0.12};
let worker:Worker|null=null, init:Promise<void>|null=null, busy=false, generation=1, frameId=0, activeFrame=0;
let frameTimer:ReturnType<typeof setTimeout>|undefined, initTimer:ReturnType<typeof setTimeout>|undefined;
let cameraRunning=false, cameraStarting=false, cameraToken=0, cameraStream:MediaStream|null=null, lastCapture=-Infinity;
let resolveInit:(()=>void)|null=null, rejectInit:((error:Error)=>void)|null=null;
declare global { interface Window { __stackCheck:{lastResult:VisionResponse|null; error:string|null} } }
window.__stackCheck={lastResult:null,error:null};
function fail(message:string){
  status.textContent=message;window.__stackCheck.error=message;
  rejectInit?.(new Error(message));rejectInit=null;resolveInit=null;
  clearTimeout(initTimer);clearTimeout(frameTimer);
  worker?.terminate();worker=null;init=null;busy=false;generation++;
}
function ensureWorker():Promise<void>{
  if(init)return init;
  window.__stackCheck.error=null;
  status.textContent='正在初始化本地 OpenCV Worker';
  init=new Promise<void>((resolve,reject)=>{
    resolveInit=resolve;rejectInit=reject;
    const instance=new Worker(new URL('generated/vision.worker.js',document.baseURI));
    worker=instance;
    instance.onerror=(e)=>fail('Worker 错误：'+e.message);
    instance.onmessage=(event:MessageEvent<VisionResponse>)=>{
      const message=event.data;
      const messageGeneration=message.kind==='RESULT'?message.token.generation:message.generation;
      if(messageGeneration!==generation)return;
      if(message.kind==='READY'){
        clearTimeout(initTimer);status.textContent='OpenCV '+message.opencvVersion+' Worker 已就绪';
        resolveInit?.();resolveInit=null;rejectInit=null;
      }else if(message.kind==='RESULT'){
        if(message.token.frameId!==activeFrame)return;
        clearTimeout(frameTimer);busy=false;
        const age=performance.now()-message.token.sampleAtMs;
        if(age>250){status.textContent='丢弃过期结果：'+age.toFixed(0)+' ms';return;}
        window.__stackCheck.lastResult=message;
        status.textContent=`识别完成 · ${message.processingMs.toFixed(1)} ms 计算 · ${age.toFixed(1)} ms 采样至接收`;
        result.textContent=JSON.stringify({frameId:message.token.frameId,candidates:message.candidates},null,2);
      }else if(message.kind==='ERROR')fail(message.code+'：'+message.message);
    };
    const request:VisionRequest={kind:'INIT',protocol:'1.0',generation,configVersion:1,opencvUrl:new URL('vendor/opencv/opencv-4.13.0.js',document.baseURI).href,config};
    instance.postMessage(request);
    initTimer=setTimeout(()=>fail('OpenCV 初始化超过 15 秒；检查本地文件后重试'),15000);
  });
  return init;
}
async function sendFrame(source:HTMLCanvasElement|HTMLVideoElement){
  if(busy || !worker)return;
  busy=true;
  const sampledAt=performance.now(), capturedGeneration=generation, targetWorker=worker;
  try{
    const bitmap=await createImageBitmap(source);
    if(capturedGeneration!==generation || targetWorker!==worker){bitmap.close();return;}
    const token={generation,sessionId:'stack-check',contextId:1,turnId:1,playerId:'A' as const,source:'motion' as const,configVersion:1,frameId:++frameId,sampleAtMs:sampledAt};
    activeFrame=token.frameId;
    const request:VisionRequest={kind:'FRAME',token,bitmap};
    targetWorker.postMessage(request,[bitmap]);
    frameTimer=setTimeout(()=>fail('视觉计算超过 1 秒，请停止后重试；游戏仍可操作'),1000);
  }catch(error){fail('图像采样失败：'+String(error));}
}
document.querySelector('#synthetic')!.addEventListener('click',async()=>{
  if(cameraRunning || cameraStarting){status.textContent='请先停止摄像头，再测试合成图';return;}
  try{
    await ensureWorker();
    ctx.fillStyle='#172c3b';ctx.fillRect(0,0,320,240);
    ctx.fillStyle='#00ffff';ctx.fillRect(50,90,40,60);
    ctx.fillStyle='#ff00ff';ctx.fillRect(230,90,40,60);
    await sendFrame(sample);
  }catch(error){status.textContent=String(error);}
});
function videoLoop(now:number){
  if(!cameraRunning)return;
  if(now-lastCapture>=50 && !busy){lastCapture=now;void sendFrame(video);}
  if('requestVideoFrameCallback' in video)video.requestVideoFrameCallback(videoLoop);
  else setTimeout(()=>videoLoop(performance.now()),50);
}
document.querySelector('#camera')!.addEventListener('click',async()=>{
  if(cameraRunning || cameraStarting)return;
  cameraStarting=true;const requestToken=++cameraToken;
  try{
    await ensureWorker();
    const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:320},height:{ideal:240}},audio:false});
    if(requestToken!==cameraToken){stream.getTracks().forEach(t=>t.stop());return;}
    cameraStream=stream;video.srcObject=stream;await video.play();
    if(requestToken!==cameraToken){stream.getTracks().forEach(t=>t.stop());return;}
    video.style.display='block';sample.style.display='none';cameraRunning=true;lastCapture=-Infinity;
    videoLoop(performance.now());
  }catch(error){status.textContent='摄像头未启动：'+String(error);cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;}
  finally{cameraStarting=false;}
});
function stopVision(){
  cameraToken++;cameraRunning=false;cameraStarting=false;
  cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;video.srcObject=null;
  video.style.display='none';sample.style.display='block';
  rejectInit?.(new Error('视觉已停止'));rejectInit=null;resolveInit=null;
  clearTimeout(initTimer);clearTimeout(frameTimer);
  worker?.terminate();worker=null;init=null;busy=false;generation++;
  status.textContent='视觉已停止；可以重新测试';
}
document.querySelector('#stop')!.addEventListener('click',stopVision);
window.addEventListener('pagehide',stopVision);
if(import.meta.hot)import.meta.hot.dispose(()=>{stopVision();game.destroy(true);});

