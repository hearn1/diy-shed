import { EFFORT_LEVELS, SKILL_LEVELS } from '../util/validate.js';

export function buildResearchPrompt({ name, description }) {
  const desc = description && description.trim() ? description.trim() : '(no description provided)';
  return `You are researching a home DIY project so a homeowner can decide whether and how to tackle it.

Project name: ${name}
Project description: ${desc}

Use WebSearch and WebFetch to research how this project is typically done, what tools and materials it needs, roughly what they cost, and how much effort it takes.

Respond with a SINGLE JSON object and NOTHING else — no prose, no explanation, no markdown code fences. The object must have exactly these keys:

- "summary": string — a short description of the recommended approach.
- "effort": object with:
    - "level": one of ${EFFORT_LEVELS.map((l) => `"${l}"`).join(', ')}
    - "hours": number — estimated hours of work (>= 0)
    - "skill": one of ${SKILL_LEVELS.map((s) => `"${s}"`).join(', ')}
- "guides": array of 3 to 5 objects, each with "title" (string), "url" (a valid http or https link to a guide), and "summary" (string).
- "tools": array of objects, each with "name" (string) and "est_cost" (approximate cost in US dollars as a number, or null if unknown). Tools are reusable.
- "materials": array of objects, each with "name" (string) and "est_cost" (US dollars as a number, or null). Materials are consumed by the project.
- "steps": array of strings — an ordered, step-by-step checklist of the actions needed to actually carry out the project, from start to finish. Each entry is one instruction (e.g. "Cut the frame boards to length").

Return only the JSON object.`;
}
