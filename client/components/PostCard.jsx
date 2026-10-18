import { useState } from 'react';
import { Heart, MessageCircle, Bookmark, Share2, Send, ArrowUpRight, Flag } from 'lucide-react';
import { Avatar } from './ui.jsx';
import { people } from '../data/seed.js';
import { NotePattern, TopicIcon } from './Graphics.jsx';

function timestamp(value) {
  const hours = Math.max(0, (Date.now() - Date.parse(value)) / 3_600_000);
  if (hours < 1 / 60) return 'Just now';
  if (hours < 1) return `${Math.floor(hours * 60)}m ago`;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Karachi',
  }).format(new Date(value));
}

function excerpt(text, length) {
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

export default function PostCard({
  post,
  state,
  dispatch,
  notify,
  onTopic,
  onOpen,
  onEdit,
  onDelete,
  onReport,
  detail = false,
  onPerson = null,
  mode = 'demo',
}) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [removingComment, setRemovingComment] = useState(null);
  const author =
    post.authorId === 'you'
      ? state.profile
      : (state.people || people).find((person) => person.id === post.authorId) || {
          name: 'Former member',
          handle: 'unavailable',
        };
  const liked = state.liked.includes(post.id);
  const saved = state.saved.includes(post.id);
  const title = post.title || excerpt(post.text.split('\n')[0] || 'A new perspective.', 65);

  async function save() {
    if (!(await dispatch({ type: 'save', id: post.id }))) return;
    notify(saved ? 'Removed from saved posts.' : 'Saved for later.');
  }

  async function share() {
    const link = `${location.origin}${location.pathname}#post/${post.id}`;
    try {
      await navigator.clipboard.writeText(link);
      notify(
        mode === 'demo'
          ? 'Link copied. This local post opens in the same browser.'
          : 'Post link copied.',
      );
    } catch {
      notify('Clipboard unavailable. Copy the post link from the address bar.');
    }
  }

  async function addComment(event) {
    event.preventDefault();
    if (!comment.trim() || comment.trim().length > 300) {
      setError('Write a comment between 1 and 300 characters.');
      return;
    }
    if (post.comments.length >= 100) {
      setError('This conversation has reached its 100-comment limit.');
      return;
    }
    const saved = await dispatch({
      type: 'comment',
      id: post.id,
      comment: {
        id: crypto.randomUUID(),
        authorId: 'you',
        text: comment.trim(),
        createdAt: new Date().toISOString(),
      },
    });
    if (!saved) return;
    setComment('');
    setError('');
    notify('Reply added.');
  }

  const image = post.image ? (
    <img
      src={post.image}
      alt={post.imageAlt}
      loading={detail ? 'eager' : 'lazy'}
      width="1100"
      height="800"
    />
  ) : (
    <div className="text-study" data-topic={post.topic}>
      <div className="note-heading">
        <TopicIcon topic={post.topic} size={18} />
        <span>FIELD NOTES / {post.topic.toUpperCase()}</span>
      </div>
      <p>{excerpt(post.text, 175)}</p>
      <NotePattern topic={post.topic} />
      <div className="note-footer">
        <span>Open conversation</span>
        <ArrowUpRight size={17} />
      </div>
    </div>
  );

  const authorHeader = (
    <header className="post-author">
      <Avatar person={author} size="small" />
      <div>
        <h3>
          {onPerson ? (
            <button className="author-name" onClick={() => onPerson(author.id)}>
              {author.name}
            </button>
          ) : (
            author.name
          )}
        </h3>
        {detail && <span>@{author.handle}</span>}
      </div>
      <button className="topic-link" onClick={() => onTopic(post.topic)}>
        {post.topic}
      </button>
    </header>
  );

  function likeButton() {
    return (
      <button
        className={`reaction-button ${liked ? 'is-liked' : ''}`}
        onClick={() => dispatch({ type: 'like', id: post.id })}
        aria-label={`${liked ? 'Unlike' : 'Like'} post by ${author.name}`}
        aria-pressed={liked}
        disabled={state.busy}
      >
        <Heart size={17} fill={liked ? 'currentColor' : 'none'} />
        <span>{post.likes + Number(liked)}</span>
      </button>
    );
  }

  if (!detail)
    return (
      <article className="post-card" data-topic={post.topic} id={`post-${post.id}`}>
        <div className="post-media">
          {post.isSample && <span className="sample-label">Starter post</span>}
          <button
            className="media-button"
            onClick={() => onOpen(post.id)}
            aria-label={`Open post: ${title}`}
          >
            {image}
          </button>
          {post.image && (
            <span className="media-open-hint" aria-hidden="true">
              <ArrowUpRight size={18} />
            </span>
          )}
          <button
            className={`save-overlay ${saved ? 'is-saved' : ''}`}
            onClick={save}
            aria-label={`${saved ? 'Unsave' : 'Save'} post by ${author.name}`}
            aria-pressed={saved}
            disabled={state.busy}
          >
            <Bookmark size={18} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>
        {authorHeader}
        <h2 className="post-title">
          <button onClick={() => onOpen(post.id)}>{title}</button>
        </h2>
        <footer className="post-actions">
          <div>
            {likeButton()}
            <button
              className="reaction-button"
              onClick={() => onOpen(post.id)}
              aria-label={`Comments on post by ${author.name}`}
            >
              <MessageCircle size={17} />
              <span>{post.comments.length}</span>
            </button>
          </div>
          <time dateTime={post.createdAt}>{timestamp(post.createdAt)}</time>
        </footer>
      </article>
    );

  return (
    <article className="post-details" id={`post-${post.id}`}>
      <figure className="detail-media">{image}</figure>
      <div className="detail-content">
        {authorHeader}
        {post.authorId === 'you' && (
          <div className="owner-tools">
            <button className="text-button" onClick={() => onEdit(post)}>
              Edit post
            </button>
            <button className="text-button" onClick={() => onDelete(post)}>
              Delete post
            </button>
          </div>
        )}
        <h1>{title}</h1>
        <p className="post-content">{post.text}</p>
        <footer className="detail-actions">
          {likeButton()}
          <button
            className={`secondary-button ${saved ? 'is-saved' : ''}`}
            onClick={save}
            aria-label={`${saved ? 'Unsave' : 'Save'} post by ${author.name}`}
            aria-pressed={saved}
            disabled={state.busy}
          >
            <Bookmark size={17} fill={saved ? 'currentColor' : 'none'} />
            {saved ? 'Saved' : 'Save'}
          </button>
          <button
            className="icon-button"
            onClick={share}
            aria-label={`Copy link to post by ${author.name}`}
          >
            <Share2 size={18} />
          </button>
          {mode === 'live' && onReport && post.authorId !== 'you' && (
            <button
              className="icon-button"
              aria-label="Report this post"
              title="Report this post"
              onClick={() => onReport(post)}
            >
              <Flag size={18} />
            </button>
          )}
        </footer>
        {saved && (
          <label className="save-collection">
            Save in collection
            <select
              value={
                state.collections.find((collection) => collection.postIds.includes(post.id))?.id ||
                ''
              }
              onChange={(event) =>
                dispatch({
                  type: 'collection.assign',
                  id: post.id,
                  collectionId: event.target.value || null,
                })
              }
            >
              <option value="">Unfiled</option>
              {state.collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <section className="comments-section" aria-label="Post comments">
          <h2>
            Conversation <span>{post.comments.length}</span>
          </h2>
          {post.comments.length === 0 && (
            <p className="muted">Have a thought? Start the conversation.</p>
          )}
          {post.comments.map((item) => {
            const person =
              item.authorId === 'you'
                ? state.profile
                : (state.people || people).find((user) => user.id === item.authorId) || {
                    name: 'Former member',
                  };
            return (
              <article className="comment" key={item.id}>
                <Avatar person={person} size="small" />
                <div>
                  <h3>{person.name}</h3>
                  <p>{item.text}</p>
                  {item.authorId === 'you' &&
                    (removingComment === item.id ? (
                      <div className="reply-confirm" role="group" aria-label="Remove this reply">
                        <span>Remove your reply?</span>
                        <button
                          className="text-button"
                          disabled={state.busy}
                          onClick={() => setRemovingComment(null)}
                        >
                          Keep reply
                        </button>
                        <button
                          className="text-button danger-text"
                          disabled={state.busy}
                          onClick={async () => {
                            if (
                              await dispatch({
                                type: 'comment.delete',
                                id: post.id,
                                commentId: item.id,
                              })
                            ) {
                              setRemovingComment(null);
                              notify('Reply removed.');
                            }
                          }}
                        >
                          Remove reply
                        </button>
                      </div>
                    ) : (
                      <button
                        className="text-button remove-reply"
                        disabled={state.busy}
                        onClick={() => setRemovingComment(item.id)}
                      >
                        Remove your reply
                      </button>
                    ))}
                </div>
              </article>
            );
          })}
          <form className="comment-form" onSubmit={addComment}>
            <label className="sr-only" htmlFor="new-comment">
              Write a comment
            </label>
            <input
              id="new-comment"
              placeholder="Add a useful thought…"
              value={comment}
              maxLength={300}
              onChange={(event) => setComment(event.target.value)}
            />
            <button className="icon-button" aria-label="Send comment" disabled={state.busy}>
              <Send size={18} />
            </button>
          </form>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </article>
  );
}
