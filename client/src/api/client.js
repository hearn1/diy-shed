async function request(method, path, body) {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) options.body = JSON.stringify(body);
  const res = await fetch(path, options);
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.error) message = data.error;
    } catch {
      // response had no JSON body
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function get(path) {
  return request('GET', path);
}

export function post(path, body) {
  return request('POST', path, body);
}

export function put(path, body) {
  return request('PUT', path, body);
}

export function del(path) {
  return request('DELETE', path);
}

export function rerunResearch(projectId) {
  return post(`/api/projects/${projectId}/research`);
}

export function markItemOwned(projectId, itemId) {
  return post(`/api/projects/${projectId}/items/${itemId}/own`);
}

export function unlinkItem(projectId, itemId) {
  return post(`/api/projects/${projectId}/items/${itemId}/unlink`);
}

export function getCompletionReview(projectId) {
  return get(`/api/projects/${projectId}/completion-review`);
}

export function completeProject(projectId, addItemIds) {
  return post(`/api/projects/${projectId}/complete`, { add_item_ids: addItemIds });
}

export function getHealth() {
  return get('/api/health');
}

export function getSettings() {
  return get('/api/settings');
}

export function updateSettings({ w_effort }) {
  return put('/api/settings', { w_effort });
}

export function setProvider(provider) {
  return put('/api/settings/provider', { provider });
}

export function getRankedProjects(wEffort) {
  const query = wEffort === undefined ? '' : `?w_effort=${wEffort}`;
  return get(`/api/projects/ranked${query}`);
}
