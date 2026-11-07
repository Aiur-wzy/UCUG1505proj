import defaults from '../../shared/defaults.json';

export const ballDefinitions = [
  { id: 'normal', label: '普通球', name: '小青', description: '轻轻一滑，稳稳入圈。', color: 0x73bdb4 },
  { id: 'repel', label: '排斥球', name: '蓬蓬', description: '停稳后鼓起气场，推开附近的小鸟。', color: 0xe9b76c },
] as const;
export type BallTypeId = typeof ballDefinitions[number]['id'];
export type Inventory = Record<BallTypeId, number>;
export const freshInventory = (): Inventory => ({ ...defaults.inventory });
export const isBallType = (id: string): id is BallTypeId => ballDefinitions.some(ball => ball.id === id);
