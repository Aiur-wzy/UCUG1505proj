import '../../style.css';
import { bootstrap } from '../app';
const dispose = bootstrap(true);
if (import.meta.hot) import.meta.hot.dispose(dispose);
