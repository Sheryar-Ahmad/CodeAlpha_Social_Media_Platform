import { useEffect, useState } from 'react';
import { ArrowLeft, Search, X, Check } from 'lucide-react';
import { notifications } from './data/seed.js';
import { persistState, selectPosts } from './lib/state.js';
import useCommunity from './lib/useCommunity.js';
import Auth from './components/Auth.jsx';
import AccountSettings from './components/AccountSettings.jsx';
import ManageCollections from './components/ManageCollections.jsx';
import Layout, { navigation } from './components/Layout.jsx';
import Feed from './components/Feed.jsx';
import {
  Activity,
  EditProfile,
  Explore,
  Interests,
  NewCollection,
  Preferences,
  Profile,
} from './components/Screens.jsx';
import { Brand, Dialog, EmptyState } from './components/ui.jsx';
import Composer from './components/Composer.jsx';
import PostCard from './components/PostCard.jsx';

function currentRoute() {
  const hash = location.hash.slice(1);
  if (hash.startsWith('user/')) return { view: 'Profile', userId: hash.slice(5), postId: null };
  if (hash.startsWith('post/')) return { view: 'Home', postId: hash.slice(5) };
  return {
    view: navigation.find((item) => item.name.toLowerCase() === hash)?.name || 'Home',
    postId: null,
  };
}

export default function App() {
  const community = useCommunity();
  const { state, dispatch, mode, status } = community;
  const [route, setRoute] = useState(currentRoute);
  const [filter, setFilter] = useState('For you');
  const [topic, setTopic] = useState('All');
  const [collection, setCollection] = useState('all');
  const [editingPost, setEditingPost] = useState(null);
  const [query, setQuery] = useState('');
  const [returnView, setReturnView] = useState('Home');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(community.warning);
  const [storageFailed, setStorageFailed] = useState(false);
  const view = route.view;
  const unread = (state.notifications || notifications).length - state.readNotifications.length;

  useEffect(() => {
    const onHash = () => {
      setRoute(currentRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    if (mode !== 'demo') return;
    let saved = false;
    try {
      saved = persistState(window.localStorage, state);
    } catch {
      /* Access itself can be blocked, before setItem is called. */
    }
    setStorageFailed(!saved);
  }, [state]);

  useEffect(() => {
    if (mode !== 'live' || status !== 'ready') return;
    if (route.postId) void community.loadPost(route.postId);
    else {
      if (route.userId) void community.loadProfile(route.userId);
      if (view === 'Notifications') void community.refreshActivity();
      else
        void community.loadFeed({
          view: route.userId ? 'PublicProfile' : view,
          order: view !== 'Home' && filter === 'For you' ? 'Latest' : filter,
          topic,
          q: query,
          collection,
          ...(route.userId ? { author: route.userId } : {}),
        });
    }
  }, [mode, status, route.postId, route.userId, view, filter, topic, query, collection]);

  useEffect(() => {
    community.clearError();
  }, [modal]);

  useEffect(() => {
    if (status === 'signed-out') setModal(null);
  }, [status]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    document.title = `${route.postId ? 'Conversation' : view} · Forma`;
  }, [view, route.postId]);

  function navigate(next, clear = true) {
    if (clear) {
      setQuery('');
      setFilter('For you');
      setTopic('All');
      setCollection('all');
    }
    setRoute({ view: next, postId: null });
    location.hash = next.toLowerCase();
    window.scrollTo(0, 0);
  }

  function search(value) {
    setQuery(value);
    setTopic('All');
    if (view !== 'Explore' || route.postId) navigate('Explore', false);
  }

  function chooseTopic(name, openFeed = false) {
    if (openFeed) navigate('Home');
    setTopic(name);
  }

  function openPost(id) {
    setReturnView(view);
    setRoute({ view: 'Home', postId: id });
    location.hash = `post/${id}`;
    window.scrollTo(0, 0);
  }

  function openPerson(id) {
    if (mode === 'demo' || id === state.profile.id) {
      navigate('Profile');
      return;
    }
    setQuery('');
    setTopic('All');
    setFilter('Latest');
    setRoute({ view: 'Profile', userId: id, postId: null });
    location.hash = `user/${id}`;
    window.scrollTo(0, 0);
  }

  async function publish(content) {
    if (modal === 'edit' && editingPost?.authorId === 'you') {
      const saved = await dispatch({
        type: 'edit',
        id: editingPost.id,
        content,
        revision: editingPost.revision || 0,
      });
      if (!saved) return false;
      setModal(null);
      setToast('Post updated.');
      return true;
    }
    if (mode === 'demo' && state.posts.length >= 200) {
      setToast('This local demo has reached its 200-post limit.');
      return false;
    }
    const saved = await dispatch({
      type: 'publish',
      content,
      post: {
        ...content,
        id: crypto.randomUUID(),
        authorId: 'you',
        createdAt: new Date().toISOString(),
        likes: 0,
        comments: [],
      },
    });
    if (!saved) return false;
    setModal(null);
    navigate('Home');
    setToast('Post published.');
    return true;
  }

  const posts = selectPosts(state, {
    view: route.userId ? 'PublicProfile' : view,
    filter,
    query,
    topic,
  }).filter(
    (post) =>
      view !== 'Bookmarks' ||
      collection === 'all' ||
      state.collections.find((item) => item.id === collection)?.postIds.includes(post.id),
  );
  const selectedPost = route.postId && state.posts.find((post) => post.id === route.postId);
  const sharedPostProps = {
    state,
    dispatch,
    notify: setToast,
    onTopic: (name) => chooseTopic(name, true),
    onOpen: openPost,
    onPerson: mode === 'live' ? openPerson : null,
    mode,
    onEdit: (post) => {
      setEditingPost(post);
      setModal('edit');
    },
    onDelete: (post) => {
      setEditingPost(post);
      setModal('delete');
    },
  };

  if (mode === 'live' && status === 'loading')
    return (
      <main className="app-loading" aria-busy="true">
        <Brand />
        <p role="status">Opening your space…</p>
      </main>
    );
  if (mode === 'live' && status !== 'ready')
    return (
      <Auth
        error={community.error}
        unavailable={status === 'error'}
        retry={community.retry}
        authenticate={async (kind, values) => {
          const success = await community.authenticate(kind, values);
          if (success && !route.postId && !route.userId) navigate('Home');
          return success;
        }}
      />
    );

  return (
    <>
      <Layout
        view={view}
        profile={state.profile}
        unread={unread}
        query={query}
        onSearch={search}
        navigate={navigate}
        onCompose={() => setModal('compose')}
        onSearchDialog={() => setModal('search')}
      >
        {mode === 'demo' && (
          <div className="preview-banner">
            <span>You’re exploring a local preview.</span>
            <a href="/">Sign in to the community →</a>
          </div>
        )}
        {mode === 'live' && community.error && (
          <div className="request-error" role="alert">
            <p>{community.error}</p>
            <button className="text-button" onClick={() => community.refresh(route.postId)}>
              Try again
            </button>
          </div>
        )}
        {mode === 'live' && state.busy && (
          <p className="save-status" role="status">
            Saving changes…
          </p>
        )}
        {storageFailed && (
          <p className="storage-warning" role="status">
            Your browser cannot save this demo. Changes are available for this session.
          </p>
        )}
        {route.postId ? (
          <>
            <button className="text-button back-button" onClick={() => navigate(returnView)}>
              <ArrowLeft size={17} />
              Back to{' '}
              {returnView === 'Bookmarks'
                ? 'saved posts'
                : returnView === 'Home'
                  ? 'the feed'
                  : returnView.toLowerCase()}
            </button>
            {community.loadingFeed ? (
              <p className="muted" role="status">
                Loading the conversation…
              </p>
            ) : selectedPost ? (
              <PostCard key={selectedPost.id} post={selectedPost} {...sharedPostProps} detail />
            ) : (
              <EmptyState
                icon={Search}
                title={
                  mode === 'demo'
                    ? 'This post isn’t in your browser.'
                    : 'This post is no longer available.'
                }
                detail={
                  mode === 'demo'
                    ? 'Shared links in this preview need the post to exist in the same browser.'
                    : 'It may have been deleted by its author.'
                }
                action="Explore the feed"
                onAction={() => navigate('Home')}
              />
            )}
          </>
        ) : view === 'Notifications' ? (
          <Activity
            state={state}
            dispatch={dispatch}
            onOpen={openPost}
            onPerson={openPerson}
            notify={setToast}
            mode={mode}
          />
        ) : (
          <>
            {view === 'Explore' && (
              <Explore
                state={state}
                query={query}
                onTopic={chooseTopic}
                onFollow={(id) => dispatch({ type: 'follow', id })}
                onPerson={mode === 'live' ? openPerson : null}
              />
            )}
            {view === 'Profile' && (
              <Profile
                state={state}
                person={
                  route.userId && community.publicProfile?.id === route.userId
                    ? community.publicProfile
                    : null
                }
                error={community.error}
                own={!route.userId}
                onFollow={(id) => dispatch({ type: 'follow', id })}
                onLogout={mode === 'live' ? community.logout : null}
                onAccount={mode === 'live' ? () => setModal('account') : null}
                onEdit={() => setModal('profile')}
                onSettings={() => setModal('settings')}
                onCompose={() => setModal('compose')}
              />
            )}
            {view === 'Explore' && (
              <div className="section-heading">
                <h2>From the community</h2>
                <span>
                  {posts.length} {posts.length === 1 ? 'post' : 'posts'}
                </span>
              </div>
            )}
            <Feed
              posts={posts}
              state={state}
              dispatch={dispatch}
              notify={setToast}
              view={view}
              filter={filter}
              topic={topic}
              query={query}
              onFilter={setFilter}
              onTopic={chooseTopic}
              collection={collection}
              onCollection={setCollection}
              onNewCollection={() => setModal('collection')}
              onManageCollections={() => setModal('collections')}
              onTune={() => setModal('interests')}
              onOpen={openPost}
              onCompose={() => setModal('compose')}
              onExplore={() => navigate('Explore')}
              showHeading={view !== 'Profile' && view !== 'Explore'}
              loading={community.loadingFeed}
              hasMore={community.hasMore}
              onLoadMore={community.loadMore}
              onRefresh={mode === 'live' ? () => community.refresh() : null}
              mode={mode}
              onPerson={mode === 'live' ? openPerson : null}
            />
          </>
        )}
        <footer className="site-footer">
          <span>
            <Brand />
            <small>Ideas. Work. Everyday life.</small>
          </span>
          <div>
            <button onClick={() => setModal('about')}>About</button>
            <button onClick={() => setModal('privacy')}>Privacy</button>
            <span>{mode === 'demo' ? 'Local demo' : 'Your shared community'}</span>
          </div>
        </footer>
      </Layout>

      {modal === 'compose' && (
        <Dialog
          title="Share something worth seeing."
          error={community.error}
          onClose={() => setModal(null)}
        >
          <Composer profile={state.profile} onPublish={publish} pending={state.busy} />
        </Dialog>
      )}
      {modal === 'edit' && (
        <Dialog title="Edit your post" error={community.error} onClose={() => setModal(null)}>
          <Composer
            profile={state.profile}
            onPublish={publish}
            initialPost={editingPost}
            pending={state.busy}
          />
        </Dialog>
      )}
      {modal === 'delete' && (
        <Dialog title="Delete this post?" onClose={() => setModal(null)}>
          <div className="info-dialog">
            <p>
              {mode === 'demo'
                ? 'The post and its replies will be removed from this browser, along with any bookmarks for it.'
                : 'The post, replies, and bookmarks will be removed from the community.'}
            </p>
            <div className="delete-actions">
              <button className="secondary-button" onClick={() => setModal(null)}>
                Keep post
              </button>
              <button
                className="primary-button"
                disabled={state.busy}
                onClick={async () => {
                  if (!(await dispatch({ type: 'delete', id: editingPost.id }))) return;
                  setModal(null);
                  navigate('Profile');
                  setToast('Post deleted.');
                }}
              >
                Delete post
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {modal === 'collection' && (
        <Dialog title="A new collection." error={community.error} onClose={() => setModal(null)}>
          <NewCollection
            collections={state.collections}
            pending={state.busy}
            onCreate={async (name) => {
              const id = crypto.randomUUID();
              if (!(await dispatch({ type: 'collection.create', id, name }))) return;
              setCollection(id);
              setModal(null);
              setToast('Collection created.');
            }}
          />
        </Dialog>
      )}
      {modal === 'collections' && (
        <Dialog title="Your collections" error={community.error} onClose={() => setModal(null)}>
          <ManageCollections
            collections={state.collections}
            dispatch={dispatch}
            busy={state.busy}
            onDeleted={(id) => {
              if (collection === id) setCollection('all');
            }}
          />
        </Dialog>
      )}
      {modal === 'account' && (
        <Dialog title="Your account" onClose={() => setModal(null)}>
          <AccountSettings
            onSessionRenewed={community.sessionRenewed}
            onSessionExpired={community.logout}
          />
        </Dialog>
      )}
      {modal === 'profile' && (
        <Dialog title="Edit your profile" error={community.error} onClose={() => setModal(null)}>
          <EditProfile
            profile={state.profile}
            pending={state.busy}
            onSave={async (name, bio) => {
              if (!(await dispatch({ type: 'profile', name, bio }))) return;
              setModal(null);
              setToast('Profile updated.');
            }}
          />
        </Dialog>
      )}
      {modal === 'settings' && (
        <Dialog title="Your preferences" error={community.error} onClose={() => setModal(null)}>
          <Preferences state={state} dispatch={dispatch} />
        </Dialog>
      )}
      {modal === 'interests' && (
        <Dialog title="Make the feed yours." error={community.error} onClose={() => setModal(null)}>
          <Interests state={state} dispatch={dispatch} />
        </Dialog>
      )}
      {modal === 'search' && (
        <Dialog title="Find something useful." onClose={() => setModal(null)}>
          <form
            className="mobile-search-form"
            onSubmit={(event) => {
              event.preventDefault();
              navigate('Explore', false);
              setModal(null);
            }}
          >
            <label htmlFor="dialog-search">Search ideas, people, and topics</label>
            <input
              id="dialog-search"
              maxLength={100}
              value={query}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="primary-button">
              <Search size={17} />
              Search
            </button>
          </form>
        </Dialog>
      )}
      {modal === 'about' && (
        <Dialog title="A place for your perspective." onClose={() => setModal(null)}>
          <div className="info-dialog">
            <Brand />
            <p>
              Forma brings people, ideas, and useful conversations together. Share a project, a
              lesson, a question, or an everyday perspective. Save what matters and follow the
              people who add something to your world.
            </p>
            <p>
              {mode === 'demo'
                ? 'This is a local preview with fictional sample people. Sign in from the home page to join the shared community.'
                : 'Posts and conversations are shared with signed-in members. Starter posts are labeled and represent fictional creators.'}
            </p>
          </div>
        </Dialog>
      )}
      {modal === 'privacy' && (
        <Dialog title="Your data, explained." onClose={() => setModal(null)}>
          <div className="info-dialog">
            <p>
              {mode === 'demo'
                ? 'This preview saves posts, photos, replies, bookmarks, follows, interests, your profile, and appearance in local storage.'
                : 'Forma stores your account and community activity on the server. Your profile, posts, replies, likes, and follows are visible to signed-in members. Your email, saved collections, preferences, and notifications are private.'}
            </p>
            <p>
              {mode === 'demo'
                ? 'Anyone using the same browser profile can access this preview data. Clearing site data removes it. Preview links work where the post exists locally.'
                : 'Passwords are stored as hashes. A session cookie keeps you signed in for up to seven days; signing out revokes it. Uploaded photos are stored without embedded metadata and can be accessed by anyone who has the photo URL.'}
            </p>
            <p>
              There are no analytics or tracking scripts. Your interests, follows, likes, and saves
              help rank your feed. Choose Latest for chronological order.
            </p>
          </div>
        </Dialog>
      )}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {toast && (
          <div className="toast">
            <Check size={18} />
            <p>{toast}</p>
            <button
              className="icon-button"
              onClick={() => setToast('')}
              aria-label="Dismiss notification"
            >
              <X size={17} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
