export function inventoryKey(row) {
  return `${row.type}:${row.normalized_name}`;
}

export function itemIsOwned(item, inventoryByKey) {
  if (item.inventory_id != null) {
    return { owned: true, matched_inventory_id: item.inventory_id };
  }
  const match = inventoryByKey.get(inventoryKey(item));
  if (match) {
    return { owned: true, matched_inventory_id: match.id };
  }
  return { owned: false, matched_inventory_id: null };
}

export function analyzeGap(items, inventory) {
  const inventoryByKey = new Map();
  for (const row of inventory) {
    const key = inventoryKey(row);
    if (!inventoryByKey.has(key)) inventoryByKey.set(key, row);
  }

  const analyzed = items.map((item) => ({
    ...item,
    ...itemIsOwned(item, inventoryByKey)
  }));

  const missing = analyzed.filter((item) => !item.owned);
  const est_cost = missing.reduce((sum, item) => sum + (item.est_cost ?? 0), 0);

  return { items: analyzed, missing, missing_count: missing.length, est_cost };
}

export function analyzeProjectGap(projectId, db) {
  const items = db.prepare('SELECT * FROM project_items WHERE project_id = ? ORDER BY id').all(projectId);
  const inventory = db.prepare('SELECT * FROM inventory').all();
  return analyzeGap(items, inventory);
}
