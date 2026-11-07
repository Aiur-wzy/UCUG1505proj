import defaults from '../../shared/defaults.json';

const names = ['初次着陆', '找到手感', '聚成一群', '精准落点', '完美归巢'];
const hints = ['先瞄准中心，试试一成左右力度。', '每一只停在方形区域内的小鸟都算数。', '利用墙壁反弹，也能找到好位置。', '吸引、排斥和粘黏，都能改变布局。', '把握力度，让四只小鸟一起归巢。'];
export const levels = defaults.soloLevels.map((level, index) => ({ ...level, name: names[index], hint: hints[index] }));
export type Level = typeof levels[number];
