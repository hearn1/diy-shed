export const PRIORITIES = [
  { value: 'urgent_fix', label: 'Urgent Fix' },
  { value: 'highly_desired', label: 'Highly Desired' },
  { value: 'slightly_desired', label: 'Slightly Desired' },
  { value: 'dreams', label: 'Dreams' }
];

export const STATUSES = [
  { value: 'researching', label: 'Researching' },
  { value: 'ready', label: 'Ready' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'research_failed', label: 'Research Failed' }
];

export const EFFORT_LEVELS = [
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High' }
];

export const SKILL_LEVELS = [
  { value: 'Beginner', label: 'Beginner' },
  { value: 'Intermediate', label: 'Intermediate' },
  { value: 'Advanced', label: 'Advanced' }
];

export const ITEM_TYPES = [
  { value: 'tool', label: 'Tool' },
  { value: 'material', label: 'Material' }
];

export const PRIORITY_CLASS = {
  urgent_fix: 'pill-urgent',
  highly_desired: 'pill-highly',
  slightly_desired: 'pill-slightly',
  dreams: 'pill-dreams'
};

export function labelFor(list, value) {
  const match = list.find((entry) => entry.value === value);
  return match ? match.label : value;
}
