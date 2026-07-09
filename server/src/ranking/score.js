export const EFFORT_SCORE = { Low: 1, Medium: 2, High: 3 };

export const PRIORITY_WEIGHTS = {
  urgent_fix: 1.0,
  highly_desired: 0.75,
  slightly_desired: 0.3,
  dreams: 0.05
};

export function rankProjects(projects, wEffort) {
  const w = Math.min(1, Math.max(0, wEffort));
  const maxCost = projects.reduce((max, p) => Math.max(max, p.est_cost ?? 0), 0);

  const scored = projects.map((project) => {
    const effortScore = EFFORT_SCORE[project.effort_level] ?? 2;
    const effort_norm = effortScore / 3;
    const cost_norm = maxCost > 0 ? (project.est_cost ?? 0) / maxCost : 0;
    const base_score = w * effort_norm + (1 - w) * cost_norm;
    const priority_weight = PRIORITY_WEIGHTS[project.priority] ?? PRIORITY_WEIGHTS.slightly_desired;
    const final_score = base_score / priority_weight;
    return { ...project, effort_norm, cost_norm, base_score, final_score, priority_weight };
  });

  scored.sort((a, b) => {
    if (a.final_score !== b.final_score) return a.final_score - b.final_score;
    if (a.priority_weight !== b.priority_weight) return b.priority_weight - a.priority_weight;
    const aCost = a.est_cost ?? 0;
    const bCost = b.est_cost ?? 0;
    if (aCost !== bCost) return aCost - bCost;
    return a.id - b.id;
  });

  return scored.map((project, index) => {
    const { priority_weight, ...rest } = project;
    return { ...rest, rank: index + 1 };
  });
}
