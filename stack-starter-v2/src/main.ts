import './style.css';
import { bootstrap } from './game/app';
const dispose = bootstrap();
if (import.meta.hot) import.meta.hot.dispose(dispose);
