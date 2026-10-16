import { useEffect, useReducer, useRef, useState } from 'react';
import { api } from './api.js';
import { initialState, readState, reducer } from './state.js';
import { emptyState, normalize } from './communityState.js';
import { executeAction } from './communityApi.js';

export const demoMode = /^\/demo\/?$/.test(location.pathname);

function loadedPreview() {
  if (!demoMode) return { state: initialState(), warning: '' };
  try {
    return readState(localStorage);
  } catch {
    return {
      state: initialState(),
      warning: 'Local storage is unavailable. Changes last for this session.',
    };
  }
}

export default function useCommunity() {
  const [preview] = useState(loadedPreview);
  const [localState, localDispatch] = useReducer(reducer, preview.state);
  const [state, setState] = useState(emptyState);
  const stateRef = useRef(state);
  const epoch = useRef(0);
  const queue = useRef(Promise.resolve());
  const queryRef = useRef({
    view: 'Home',
    order: 'For you',
    topic: 'All',
    q: '',
    collection: 'all',
  });
  const requestNumber = useRef(0);
  const profileRequest = useRef(0);
  const [status, setStatus] = useState(demoMode ? 'ready' : 'loading');
  const [error, setError] = useState('');
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [publicProfile, setPublicProfile] = useState(null);

  function update(updater) {
    const next = typeof updater === 'function' ? updater(stateRef.current) : updater;
    stateRef.current = next;
    setState(next);
  }
  function mergeMetadata(metadata) {
    update((previous) => {
      const users = new Map(
        [...previous.people, ...metadata.people].map((person) => [person.id, person]),
      );
      const visibleLikes = previous.posts.filter((post) => post.viewerLiked).map((post) => post.id);
      return {
        ...previous,
        ...metadata,
        people: [...users.values()],
        liked: [...new Set([...metadata.liked, ...visibleLikes])],
      };
    });
  }
  function mergePosts(rows, append = false) {
    update((previous) => {
      const normalized = normalize(rows, previous.profile.id);
      const users = new Map(
        [...previous.people, ...normalized.people].map((person) => [person.id, person]),
      );
      const posts = append
        ? [
            ...new Map(
              [...previous.posts, ...normalized.posts].map((post) => [post.id, post]),
            ).values(),
          ]
        : normalized.posts;
      const liked = new Set(previous.liked);
      for (const post of normalized.posts) {
        if (post.viewerLiked) liked.add(post.id);
        else liked.delete(post.id);
      }
      return { ...previous, posts, people: [...users.values()], liked: [...liked] };
    });
  }
  function sessionEnded() {
    epoch.current++;
    requestNumber.current++;
    update(emptyState());
    setNextCursor(null);
    setPublicProfile(null);
    setLoadingFeed(false);
    setStatus('signed-out');
  }

  async function metadata() {
    const version = epoch.current;
    const result = await api('/state');
    if (version === epoch.current) mergeMetadata(result);
  }
  async function boot() {
    const version = epoch.current;
    setStatus('loading');
    setError('');
    try {
      await api('/auth/me');
      await metadata();
      if (version === epoch.current) setStatus('ready');
    } catch (issue) {
      if (version !== epoch.current) return;
      if (issue.status === 401) sessionEnded();
      else {
        setError(issue.message);
        setStatus('error');
      }
    }
  }
  useEffect(() => {
    if (!demoMode) void boot();
  }, []);

  async function authenticate(kind, values) {
    epoch.current++;
    setError('');
    try {
      await api(`/auth/${kind}`, { method: 'POST', body: values });
      epoch.current++;
      update(emptyState());
      await metadata();
      setStatus('ready');
      return true;
    } catch (issue) {
      setError(issue.message);
      return false;
    }
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      sessionEnded();
      return true;
    } catch (issue) {
      if (issue.status === 401) {
        sessionEnded();
        return true;
      }
      setError(issue.message);
      return false;
    }
  }

  async function loadFeed(filters, append = false) {
    if (demoMode || status !== 'ready') return;
    const number = ++requestNumber.current;
    const version = epoch.current;
    queryRef.current = filters;
    setLoadingFeed(true);
    setError('');
    if (!append) {
      setNextCursor(null);
      update((previous) => ({ ...previous, posts: [] }));
    }
    try {
      const query = new URLSearchParams(filters);
      if (append && nextCursor) query.set('cursor', nextCursor);
      const [result, users] = await Promise.all([
        api(`/posts?${query}`),
        filters.view === 'Explore' ? api(`/users?q=${encodeURIComponent(filters.q || '')}`) : null,
      ]);
      if (number === requestNumber.current && version === epoch.current) {
        mergePosts(result.posts, append);
        setNextCursor(result.nextCursor);
        if (users)
          update((previous) => ({
            ...previous,
            people: [
              ...new Map(
                [...previous.people, ...users.people].map((person) => [person.id, person]),
              ).values(),
            ],
          }));
      }
    } catch (issue) {
      if (number === requestNumber.current && version === epoch.current) {
        if (issue.status === 401) sessionEnded();
        else setError(issue.message);
      }
    } finally {
      if (number === requestNumber.current) setLoadingFeed(false);
    }
  }
  async function loadPost(id) {
    if (demoMode) return;
    const number = ++requestNumber.current;
    const version = epoch.current;
    setLoadingFeed(true);
    setError('');
    try {
      const result = await api(`/posts/${encodeURIComponent(id)}`);
      if (version === epoch.current && number === requestNumber.current) mergePosts([result.post]);
    } catch (issue) {
      if (version === epoch.current && number === requestNumber.current) {
        update((previous) => ({ ...previous, posts: [] }));
        if (issue.status === 401) sessionEnded();
        else setError(issue.message);
      }
    } finally {
      if (number === requestNumber.current) setLoadingFeed(false);
    }
  }
  async function loadProfile(id) {
    const number = ++profileRequest.current;
    const version = epoch.current;
    setPublicProfile(null);
    try {
      const result = await api(`/users/${encodeURIComponent(id)}`);
      if (number === profileRequest.current && version === epoch.current)
        setPublicProfile(result.user);
    } catch (issue) {
      if (number === profileRequest.current && version === epoch.current) setError(issue.message);
    }
  }

  function dispatch(action) {
    if (demoMode) {
      localDispatch(action);
      return Promise.resolve(true);
    }
    const version = epoch.current;
    const operation = queue.current.then(async () => {
      if (version !== epoch.current) return false;
      setBusy(true);
      setError('');
      try {
        const result = await executeAction(action, stateRef.current);
        if (version !== epoch.current) return false;
        if (result?.post) mergePosts([result.post], true);
        if (action.type === 'delete')
          update((previous) => ({
            ...previous,
            posts: previous.posts.filter((post) => post.id !== action.id),
          }));
        try {
          await metadata();
        } catch (issue) {
          if (version !== epoch.current) return false;
          if (issue.status === 401) sessionEnded();
          else setError('Your change was saved. Refresh to update the rest of your space.');
        }
        if (action.type === 'follow' && publicProfile?.id === action.id)
          await loadProfile(action.id);
        return true;
      } catch (issue) {
        if (version !== epoch.current) return false;
        if (issue.status === 401) sessionEnded();
        else setError(issue.message);
        return false;
      } finally {
        setBusy(false);
      }
    });
    queue.current = operation.catch(() => false);
    return operation;
  }
  async function refresh(postId = null) {
    try {
      await metadata();
      if (postId) await loadPost(postId);
      else await loadFeed(queryRef.current);
    } catch (issue) {
      if (issue.status === 401) sessionEnded();
      else setError(issue.message);
    }
  }
  async function refreshActivity() {
    try {
      await metadata();
    } catch (issue) {
      if (issue.status === 401) sessionEnded();
      else setError(issue.message);
    }
  }
  async function sessionRenewed() {
    epoch.current++;
    await refresh();
  }
  return {
    state: demoMode ? localState : { ...state, busy },
    dispatch,
    mode: demoMode ? 'demo' : 'live',
    status,
    error,
    warning: preview.warning,
    authenticate,
    logout,
    retry: boot,
    loadingFeed,
    loadFeed,
    loadPost,
    loadProfile,
    publicProfile,
    loadMore: () => loadFeed(queryRef.current, true),
    hasMore: Boolean(nextCursor),
    refresh,
    refreshActivity,
    sessionRenewed,
    clearError: () => setError(''),
  };
}
