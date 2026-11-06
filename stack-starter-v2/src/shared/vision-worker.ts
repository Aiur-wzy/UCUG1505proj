/** Internal vision messages v1.0. Separate from the public game contract v1.1. */
export type ColorId = 'anchor' | 'guide';
export interface ColorSpec {
  id: ColorId;
  hueDeg: number;
  halfWidthDeg: number;
  saturationMin: number;
  valueMin: number;
}
export interface VisionConfig {
  width: number; height: number;
  colors: [ColorSpec, ColorSpec];
  minAreaPx: number; maxAreaRatio: number;
}
export interface FrameToken {
  generation: number;
  sessionId: string;
  contextId: number;
  turnId: number;
  playerId: 'A' | 'B' | null;
  source: 'keyboard' | 'motion';
  configVersion: number;
  frameId: number;
  /** Captured on the MAIN thread with host.now(); echoed unchanged by worker. */
  sampleAtMs: number;
}
export interface BlobCandidate {
  areaPx: number;
  /** Unmirrored image pixel coordinates; not game coordinates. */
  cx: number; cy: number;
  x: number; y: number; width: number; height: number;
}
export type VisionRequest =
  | {kind:'INIT'; protocol:'1.0'; generation:number; configVersion:number; opencvUrl:string; config:VisionConfig}
  | {kind:'CONFIG'; generation:number; configVersion:number; config:VisionConfig}
  | {kind:'FRAME'; token:FrameToken; bitmap:ImageBitmap}
  | {kind:'STOP'; generation:number};
export type VisionResponse =
  | {kind:'READY'; protocol:'1.0'; generation:number; configVersion:number; opencvVersion:string}
  | {kind:'CONFIGURED'; generation:number; configVersion:number}
  | {kind:'RESULT'; token:FrameToken; processingMs:number; candidates:Record<ColorId,BlobCandidate[]>}
  | {kind:'ERROR'; generation:number; frameId?:number; code:'INIT_FAILED'|'FRAME_FAILED'|'BAD_CONFIG'; message:string}
  | {kind:'STOPPED'; generation:number};
