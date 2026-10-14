import { useEffect, useReducer, useState } from 'react';
import { ArrowLeft, Search, X, Check } from 'lucide-react';
import { notifications } from './data/seed.js';
import { initialState, persistState, readState, reducer, selectPosts } from './lib/state.js';
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
  if (hash.startsWith('post/')) return { view: 'Home', postId: hash.slice(5) };
  return {
    view: navigation.find((item) => item.name.toLowerCase() === hash)?.name || 'Home',
    postId: null,
  };
}

function loadDemo() {
  try {
    return readState(window.localStorage);
  } catch {
    return {
      state: initialState(),
      warning: 'Local storage is unavailable. Changes will last for this session.',
    };
  }
}

export default function App() {
  const [loaded] = useState(loadDemo);
  const [state, dispatch] = useReducer(reducer, loaded.state);
  const [route, setRoute] = useState(currentRoute);
  const [filter, setFilter] = useState('For you');
  const [topic, setTopic] = useState('All');
  const [collection, setCollection] = useState('all');
  const [editingPost, setEditingPost] = useState(null);
  const [query, setQuery] = useState('');
  const [returnView, setReturnView] = useState('Home');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(loaded.warning);
  const [storageFailed, setStorageFailed] = useState(false);
  const view = route.view;
  const unread = notifications.length - state.readNotifications.length;

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
    let saved = false;
    try {
      saved = persistState(window.localStorage, state);
    } catch {
      /* Access itself can be blocked, before setItem is called. */
    }
    setStorageFailed(!saved);
  }, [state]);

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

  function publish(content) {
    if (modal === 'edit' && editingPost?.authorId === 'you') {
      dispatch({ type: 'edit', id: editingPost.id, content });
      setModal(null);
      setToast('Post updated.');
      return true;
    }
    if (state.posts.length >= 200) {
      setToast('This local demo has reached its 200-post limit.');
      return false;
    }
    dispatch({
      type: 'publish',
      post: {
        ...content,
        id: crypto.randomUUID(),
        authorId: 'you',
        createdAt: new Date().toISOString(),
        likes: 0,
        comments: [],
      },
    });
    setModal(null);
    navigate('Home');
    setToast('Post published.');
    return true;
  }

  const posts = selectPosts(state, { view, filter, query, topic }).filter(
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
    onEdit: (post) => {
      setEditingPost(post);
      setModal('edit');
    },
    onDelete: (post) => {
      setEditingPost(post);
      setModal('delete');
    },
  };

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
            {selectedPost ? (
              <PostCard key={selectedPost.id} post={selectedPost} {...sharedPostProps} detail />
            ) : (
              <EmptyState
                icon={Search}
                title="This post isn’t in your browser."
                detail="Shared links in this preview need the post to exist in the same browser."
                action="Explore the feed"
                onAction={() => navigate('Home')}
              />
            )}
          </>
        ) : view === 'Notifications' ? (
          <Activity state={state} dispatch={dispatch} onOpen={openPost} notify={setToast} />
        ) : (
          <>
            {view === 'Explore' && (
              <Explore
                state={state}
                query={query}
                onTopic={chooseTopic}
                onFollow={(id) => dispatch({ type: 'follow', id })}
              />
            )}
            {view === 'Profile' && (
              <Profile
                state={state}
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
              onTune={() => setModal('interests')}
              onOpen={openPost}
              onCompose={() => setModal('compose')}
              onExplore={() => navigate('Explore')}
              showHeading={view !== 'Profile' && view !== 'Explore'}
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
            <span>Local demo</span>
          </div>
        </footer>
      </Layout>

      {modal === 'compose' && (
        <Dialog title="Share something worth seeing." onClose={() => setModal(null)}>
          <Composer profile={state.profile} onPublish={publish} />
        </Dialog>
      )}
      {modal === 'edit' && (
        <Dialog title="Edit your post" onClose={() => setModal(null)}>
          <Composer profile={state.profile} onPublish={publish} initialPost={editingPost} />
        </Dialog>
      )}
      {modal === 'delete' && (
        <Dialog title="Delete this post?" onClose={() => setModal(null)}>
          <div className="info-dialog">
            <p>
              The post and its replies will be removed from this browser, along with any bookmarks
              for it.
            </p>
            <div className="delete-actions">
              <button className="secondary-button" onClick={() => setModal(null)}>
                Keep post
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  dispatch({ type: 'delete', id: editingPost.id });
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
        <Dialog title="A new collection." onClose={() => setModal(null)}>
          <NewCollection
            collections={state.collections}
            onCreate={(name) => {
              const id = crypto.randomUUID();
              dispatch({ type: 'collection.create', id, name });
              setCollection(id);
              setModal(null);
              setToast('Collection created.');
            }}
          />
        </Dialog>
      )}
      {modal === 'profile' && (
        <Dialog title="Edit your profile" onClose={() => setModal(null)}>
          <EditProfile
            profile={state.profile}
            onSave={(name, bio) => {
              dispatch({ type: 'profile', name, bio });
              setModal(null);
              setToast('Profile updated.');
            }}
          />
        </Dialog>
      )}
      {modal === 'settings' && (
        <Dialog title="Your preferences" onClose={() => setModal(null)}>
          <Preferences state={state} dispatch={dispatch} />
        </Dialog>
      )}
      {modal === 'interests' && (
        <Dialog title="Make the feed yours." onClose={() => setModal(null)}>
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
              This is a working local preview with fictional sample people. Secure accounts and
              shared community features are the next development phase.
            </p>
          </div>
        </Dialog>
      )}
      {modal === 'privacy' && (
        <Dialog title="Your data, explained." onClose={() => setModal(null)}>
          <div className="info-dialog">
            <p>
              This demo saves posts, photos, replies, bookmarks, follows, interests, your profile,
              and appearance in this browser’s local storage. There is no server or account system
              yet.
            </p>
            <p>
              Anyone using the same browser profile can access this data. Clearing site data removes
              it. Shared post links work only where that post exists locally.
            </p>
            <p>
              There are no analytics or tracking scripts. Feed ranking uses only your choices within
              this demo.
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
