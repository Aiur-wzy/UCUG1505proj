import {build} from 'vite';
import {fileURLToPath} from 'node:url';
await build({
  configFile:false,
  publicDir:false,
  logLevel:'warn',
  build:{
    target:'es2022',
    outDir:fileURLToPath(new URL('../public/generated',import.meta.url)),
    emptyOutDir:false,
    copyPublicDir:false,
    minify:false,
    watch:process.argv.includes('--watch')?{}:null,
    lib:{entry:fileURLToPath(new URL('../src/motion/vision.worker.ts',import.meta.url)),name:'FlockVisionWorker',formats:['iife'],fileName:()=> 'vision.worker.js'}
  }
});
