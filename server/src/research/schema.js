import { EFFORT_LEVELS, SKILL_LEVELS } from '../util/validate.js';

function isHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function coerceCost(value) {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

function parseSteps(arr, errors) {
  const out = [];
  if (!Array.isArray(arr)) {
    errors.push('steps must be an array');
    return out;
  }
  if (arr.length < 1) {
    errors.push('steps must have at least 1 entry');
    return out;
  }
  arr.forEach((item, i) => {
    const text = typeof item === 'string' ? item.trim() : '';
    if (!text) {
      errors.push(`steps[${i}] must be a non-empty string`);
      return;
    }
    out.push(text);
  });
  return out;
}

function parseItems(arr, label, errors) {
  const out = [];
  if (!Array.isArray(arr)) {
    errors.push(`${label} must be an array`);
    return out;
  }
  arr.forEach((item, i) => {
    const name = item && typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) {
      errors.push(`${label}[${i}].name must be a non-empty string`);
      return;
    }
    const cost = coerceCost(item.est_cost);
    if (!cost.ok) {
      errors.push(`${label}[${i}].est_cost must be a number >= 0 or null`);
      return;
    }
    out.push({ name, est_cost: cost.value });
  });
  return out;
}

export function validateResearchResult(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['result must be a JSON object'] };
  }

  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  if (!summary) errors.push('summary must be a non-empty string');

  let effort = null;
  const e = obj.effort;
  if (!e || typeof e !== 'object' || Array.isArray(e)) {
    errors.push('effort must be an object');
  } else {
    const hours = Number(e.hours);
    const levelOk = EFFORT_LEVELS.includes(e.level);
    const skillOk = SKILL_LEVELS.includes(e.skill);
    const hoursOk = Number.isFinite(hours) && hours >= 0;
    if (!levelOk) errors.push(`effort.level must be one of ${EFFORT_LEVELS.join(', ')}`);
    if (!hoursOk) errors.push('effort.hours must be a finite number >= 0');
    if (!skillOk) errors.push(`effort.skill must be one of ${SKILL_LEVELS.join(', ')}`);
    if (levelOk && hoursOk && skillOk) effort = { level: e.level, hours, skill: e.skill };
  }

  const guides = [];
  if (!Array.isArray(obj.guides)) {
    errors.push('guides must be an array');
  } else if (obj.guides.length < 1 || obj.guides.length > 5) {
    errors.push('guides must have 1 to 5 entries');
  } else {
    obj.guides.forEach((g, i) => {
      const title = g && typeof g.title === 'string' ? g.title.trim() : '';
      const gSummary = g && typeof g.summary === 'string' ? g.summary.trim() : '';
      const urlOk = g && isHttpUrl(g.url);
      if (!title) errors.push(`guides[${i}].title must be a non-empty string`);
      if (!urlOk) errors.push(`guides[${i}].url must be a valid http(s) URL`);
      if (title && urlOk) guides.push({ title, url: g.url, summary: gSummary });
    });
  }

  const tools = parseItems(obj.tools, 'tools', errors);
  const materials = parseItems(obj.materials, 'materials', errors);
  const steps = parseSteps(obj.steps, errors);

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { summary, effort, guides, tools, materials, steps } };
}
