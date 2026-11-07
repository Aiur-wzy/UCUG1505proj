import type { GameState } from '../core/gameState';
import { levels } from '../config/levels';
import { birdSvg } from '../ui/art';
export function resultMarkup(state: GameState): string {
  const result = state.result!;
  const title = state.mode === 'solo' ? result.passed ? state.levelIndex === 4 ? '全员归巢！' : '漂亮的着陆！' : '再试一次，差一点点。' : result.winner ? `${result.winner} 队，赢得这片冰场！` : '旗鼓相当，握个翅吧。';
  const detail = state.mode === 'solo' ? `${levels[state.levelIndex].name} · 目标 ${result.target} 分` : '只有更靠近圆心的一方得分';
  return `<div class="result-card"><div class="result-bird">${birdSvg(result.passed || result.winner === 'A' ? '#74bcb1' : '#e9b76c')}</div><p class="eyebrow">${state.mode === 'solo' ? `关卡 ${state.levelIndex + 1} / 5` : '本局结束'}</p><h2>${title}</h2><p>${detail}</p><div class="result-score">${state.mode === 'solo' ? `<strong>${result.score.A}</strong><span>分 / 目标 ${result.target}</span>` : `<span>A 队</span><strong>${result.score.A}<i>:</i>${result.score.B}</strong><span>B 队</span>`}</div><div class="result-actions">${state.mode === 'solo' && result.passed && state.levelIndex < 4 ? '<button class="primary" data-action="next">飞向下一关 ↗</button>' : ''}<button class="${state.mode === 'duel' || !result.passed || state.levelIndex === 4 ? 'primary' : 'secondary'}" data-action="retry">${state.mode === 'duel' ? '再来一局 · 交换先手' : '再试这一关'}</button><button class="text-button" data-action="menu">回到首页</button></div></div>`;
}
