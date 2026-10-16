import {
  Bookmark,
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  Plus,
  RefreshCw,
  FolderCog,
} from 'lucide-react';
import { topics } from '../data/seed.js';
import { EmptyState } from './ui.jsx';
import PostCard from './PostCard.jsx';
import { PerspectiveArt, TopicIcon } from './Graphics.jsx';

export function PageHeading({ eyebrow, title, description, children }) {
  return (
    <section className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function Feed({
  posts,
  state,
  dispatch,
  notify,
  view,
  filter,
  topic,
  query,
  collection,
  onCollection,
  onNewCollection,
  onManageCollections,
  onFilter,
  onTopic,
  onTune,
  onOpen,
  onCompose,
  onExplore,
  showHeading = true,
  loading = false,
  hasMore = false,
  onLoadMore,
  onRefresh,
  onPerson,
  mode = 'demo',
}) {
  const isHome = view === 'Home';
  const order = isHome ? filter : filter === 'Popular' ? 'Popular' : 'Latest';
  const filterOptions = isHome
    ? ['For you', 'Following', 'Latest', 'Popular']
    : ['Latest', 'Popular'];
  const isProfile = view === 'Profile';

  return (
    <>
      {showHeading &&
        (isHome ? (
          <div className="feed-intro">
            <PageHeading
              eyebrow="A COMMUNITY FOR CURIOUS PEOPLE"
              title={
                <>
                  Find your next <span>idea.</span>
                </>
              }
              description="Share your work. Learn something new. Find your people."
            />
            <PerspectiveArt />
          </div>
        ) : view === 'Bookmarks' ? (
          <PageHeading
            eyebrow="YOUR PERSONAL COLLECTION"
            title={
              <>
                Good ideas, <span>kept.</span>
              </>
            }
            description="Work, references, and conversations you want to return to."
          />
        ) : (
          <PageHeading
            title={query ? `Results for “${query}”` : 'Work worth a closer look.'}
            description={`${posts.length} ${posts.length === 1 ? 'post' : 'posts'} to explore`}
          />
        ))}

      <div className="feed-controls">
        {view === 'Bookmarks' ? (
          <div className="topic-tabs" aria-label="Saved collections">
            <button
              className={collection === 'all' ? 'selected' : ''}
              aria-pressed={collection === 'all'}
              onClick={() => onCollection('all')}
            >
              All saved <span>{state.saved.length}</span>
            </button>
            {state.collections.map((item) => (
              <button
                key={item.id}
                className={collection === item.id ? 'selected' : ''}
                aria-pressed={collection === item.id}
                onClick={() => onCollection(item.id)}
              >
                {item.name} <span>{item.postIds.length}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="topic-tabs" aria-label="Filter by topic">
            {['All', ...topics.map((item) => item.name)].map((name) => (
              <button
                key={name}
                data-topic={name}
                className={topic === name ? 'selected' : ''}
                aria-pressed={topic === name}
                onClick={() => onTopic(name)}
              >
                <TopicIcon topic={name} />
                {name === 'All' ? 'All work' : name}
              </button>
            ))}
          </div>
        )}
        <div className="feed-tools">
          {onRefresh && (
            <button
              className="icon-button"
              aria-label="Refresh community"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw size={18} />
            </button>
          )}
          <label className="sort-select">
            <span className="sr-only">Feed order</span>
            <select value={order} onChange={(event) => onFilter(event.target.value)}>
              {filterOptions.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          {isHome && (
            <button
              className="icon-button tune-button"
              onClick={onTune}
              aria-label="Tune your feed"
              title="Tune your feed"
            >
              <SlidersHorizontal size={19} />
            </button>
          )}
          {view === 'Bookmarks' && (
            <button
              className="icon-button"
              onClick={onManageCollections}
              aria-label="Manage collections"
              title="Manage collections"
            >
              <FolderCog size={20} />
            </button>
          )}
          {view === 'Bookmarks' && (
            <button
              className="icon-button"
              onClick={onNewCollection}
              aria-label="New collection"
              title="New collection"
            >
              <Plus size={20} />
            </button>
          )}
        </div>
      </div>

      <section className="post-grid" aria-label={isProfile ? 'Your posts' : 'Posts'}>
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            state={state}
            dispatch={dispatch}
            notify={notify}
            onOpen={onOpen}
            onPerson={onPerson}
            mode={mode}
            onTopic={(name) => onTopic(name, true)}
          />
        ))}
      </section>
      {loading && (
        <div className="feed-skeleton" role="status" aria-label="Loading perspectives">
          <span />
          <span />
          <span />
        </div>
      )}
      {!loading && posts.length === 0 && (
        <EmptyState
          icon={view === 'Bookmarks' ? Bookmark : Search}
          title={
            view === 'Bookmarks'
              ? 'Keep something worth returning to.'
              : isProfile
                ? 'Your first idea belongs here.'
                : 'Nothing here just yet.'
          }
          detail={
            view === 'Bookmarks'
              ? 'Use the bookmark on any post to start your collection.'
              : isProfile
                ? 'Share your work, a question, or something you learned.'
                : 'Try another topic, search, or feed order.'
          }
          action={isProfile ? 'Create a post' : 'Explore the community'}
          onAction={isProfile ? onCompose : onExplore}
        />
      )}
      {hasMore && (
        <div className="load-more">
          <button className="secondary-button" onClick={onLoadMore} disabled={loading}>
            {loading ? 'Loading…' : 'Load more perspectives'}
          </button>
        </div>
      )}
      {!loading && !hasMore && posts.length > 0 && (
        <div className="feed-end">
          <p>
            {posts.length} {posts.length === 1 ? 'perspective' : 'perspectives'}. What’s yours?
          </p>
          <button className="text-button" onClick={onCompose}>
            Share your work <ArrowUpRight size={16} />
          </button>
        </div>
      )}
    </>
  );
}
