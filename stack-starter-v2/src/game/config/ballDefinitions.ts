import defaults from '../../shared/defaults.json';

export const ballDefinitions = [
  { id: 'normal', label: '普通球', name: '小黄', description: '轻轻一滑，稳稳入区。', color: 0xe9b76c },
  { id: 'repel', label: '排斥球', name: '蓬蓬', description: '停稳后推开附近的小鸟。', color: 0x73bdb4 },
  { id: 'attract', label: '吸引球', name: '团团', description: '停稳后拉近附近的小鸟。', color: 0x7faed5 },
  { id: 'sticky', label: '粘黏球', name: '黏黏', description: '黏住首次接触的小鸟，停稳后分离。', color: 0xde8c83 },
] as const;
export type BallTypeId = typeof ballDefinitions[number]['id'];
export type Inventory = Record<BallTypeId, number>;
export const freshInventory = (): Inventory => ({ ...defaults.inventory });
export const isBallType = (id: string): id is BallTypeId => ballDefinitions.some(ball => ball.id === id);
