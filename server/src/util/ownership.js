import db from '../db/index.js';

export function ownProjectItem(item) {
  let inventory = db
    .prepare('SELECT * FROM inventory WHERE type = ? AND normalized_name = ? ORDER BY id')
    .get(item.type, item.normalized_name);
  if (!inventory) {
    const info = db
      .prepare('INSERT INTO inventory (name, normalized_name, type, quantity, notes) VALUES (?,?,?,?,?)')
      .run(item.name, item.normalized_name, item.type, null, null);
    inventory = db.prepare('SELECT * FROM inventory WHERE id = ?').get(info.lastInsertRowid);
  }
  db.prepare("UPDATE project_items SET inventory_id = ?, match_override = 'auto' WHERE id = ?").run(inventory.id, item.id);
  return inventory;
}
