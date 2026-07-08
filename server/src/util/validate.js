export const STATUSES = ['researching', 'ready', 'in_progress', 'done', 'research_failed'];
export const PRIORITIES = ['urgent_fix', 'highly_desired', 'slightly_desired', 'dreams'];
export const EFFORT_LEVELS = ['Low', 'Medium', 'High'];
export const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
export const ITEM_TYPES = ['tool', 'material'];

export function isValidEnum(value, allowed) {
  return allowed.includes(value);
}
