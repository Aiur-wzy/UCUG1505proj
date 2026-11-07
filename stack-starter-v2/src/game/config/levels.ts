import defaults from '../../shared/defaults.json';

const names = ['初次着陆', '找到手感', '聚成一群', '精准落点', '完美归巢'];
const hints = ['先瞄准圆心，试试六成力度。', '每一只停在圈内的小鸟都算数。', '轻推已落场的小鸟，腾出更好的位置。', '给蓬蓬留一点空间，气场也能帮上忙。', '观察预计落点，让小鸟们一起归巢。'];
export const levels = defaults.soloLevels.map((level, index) => ({ ...level, name: names[index], hint: hints[index] }));
export type Level = typeof levels[number];
