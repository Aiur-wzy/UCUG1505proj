import type { PlayerId } from '../../shared/contract';
import { levels } from '../config/levels';
import { freshInventory } from '../config/ballDefinitions';
import type { BallSnapshot, Mode } from './gameState';
import { soloResult } from './soloMode';
import { duelResult, otherPlayer } from './duelMode';

export const initialInventories = () => ({ A: freshInventory(), B: freshInventory() });
export const totalShots = (mode: Mode) => Object.values(freshInventory()).reduce((sum, count) => sum + count, 0) * (mode === 'solo' ? 1 : 2);
export const nextPlayer = (mode: Mode, player: PlayerId) => mode === 'solo' ? 'A' : otherPlayer(player);
export const matchResult = (mode: Mode, balls: BallSnapshot[], levelIndex: number) => mode === 'solo' ? soloResult(balls, levels[levelIndex]) : duelResult(balls);
