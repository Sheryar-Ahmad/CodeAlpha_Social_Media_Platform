import { api } from './api.js';

// Keep each UI action mapped to one explicit API operation.
export async function executeAction(action, current) {
  switch (action.type) {
    case 'publish':
      return api('/posts', { method: 'POST', body: action.content });
    case 'edit':
      return api(`/posts/${action.id}`, {
        method: 'PATCH',
        body: { ...action.content, revision: action.revision },
      });
    case 'delete':
      return api(`/posts/${action.id}`, { method: 'DELETE' });
    case 'like':
      return api(`/posts/${action.id}/like`, {
        method: current.liked.includes(action.id) ? 'DELETE' : 'PUT',
      });
    case 'save':
      return api(`/bookmarks/${action.id}`, {
        method: current.saved.includes(action.id) ? 'DELETE' : 'PUT',
      });
    case 'comment':
      return api(`/posts/${action.id}/comments`, {
        method: 'POST',
        body: { text: action.comment.text },
      });
    case 'comment.delete':
      return api(`/posts/${action.id}/comments/${action.commentId}`, { method: 'DELETE' });
    case 'follow':
      return api(`/follows/${action.id}`, {
        method: current.following.includes(action.id) ? 'DELETE' : 'PUT',
      });
    case 'profile':
      return api('/users/me', { method: 'PATCH', body: { name: action.name, bio: action.bio } });
    case 'interests':
      return api('/preferences', { method: 'PATCH', body: { interests: action.values } });
    case 'theme':
      return api('/preferences', { method: 'PATCH', body: { theme: action.value } });
    case 'read':
      return api('/notifications/read', { method: 'POST' });
    case 'collection.create':
      return api('/collections', { method: 'POST', body: { id: action.id, name: action.name } });
    case 'collection.rename':
      return api(`/collections/${encodeURIComponent(action.id)}`, {
        method: 'PATCH',
        body: { name: action.name },
      });
    case 'collection.delete':
      return api(`/collections/${encodeURIComponent(action.id)}`, { method: 'DELETE' });
    case 'collection.assign':
      return api(`/bookmarks/${action.id}/collection`, {
        method: 'PATCH',
        body: { collectionId: action.collectionId },
      });
    default:
      throw Error('Unsupported action.');
  }
}
