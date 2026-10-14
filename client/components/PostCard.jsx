import { useState } from 'react';
import { Heart, MessageCircle, Bookmark, Share2, Send, ArrowUpRight } from 'lucide-react';
import { Avatar } from './ui.jsx';
import { people } from '../data/seed.js';

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
  detail = false,
}) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const author =
    post.authorId === 'you' ? state.profile : people.find((person) => person.id === post.authorId);
  const liked = state.liked.includes(post.id);
  const saved = state.saved.includes(post.id);
  const title = post.title || excerpt(post.text.split('\n')[0] || 'A new perspective.', 65);

  function save() {
    dispatch({ type: 'save', id: post.id });
    notify(saved ? 'Removed from saved posts.' : 'Saved for later.');
  }

  async function share() {
    const link = `${location.origin}${location.pathname}#post/${post.id}`;
    try {
      await navigator.clipboard.writeText(link);
      notify('Link copied. This local post opens in the same browser.');
    } catch {
      notify('Clipboard unavailable. Copy the post link from the address bar.');
    }
  }

  function addComment(event) {
    event.preventDefault();
    if (!comment.trim() || comment.trim().length > 300) {
      setError('Write a comment between 1 and 300 characters.');
      return;
    }
    if (post.comments.length >= 100) {
      setError('This demo thread has reached its 100-comment limit.');
      return;
    }
    dispatch({
      type: 'comment',
      id: post.id,
      comment: {
        id: crypto.randomUUID(),
        authorId: 'you',
        text: comment.trim(),
        createdAt: new Date().toISOString(),
      },
    });
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
    <div className="text-study">
      <span>FIELD NOTES / {post.topic.toUpperCase()}</span>
      <p>{excerpt(post.text, 175)}</p>
      <ArrowUpRight size={25} />
    </div>
  );

  const authorHeader = (
    <header className="post-author">
      <Avatar person={author} size="small" />
      <div>
        <h3>{author.name}</h3>
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
      >
        <Heart size={17} fill={liked ? 'currentColor' : 'none'} />
        <span>{post.likes + Number(liked)}</span>
      </button>
    );
  }

  if (!detail)
    return (
      <article className="post-card" id={`post-${post.id}`}>
        <div className="post-media">
          <button
            className="media-button"
            onClick={() => onOpen(post.id)}
            aria-label={`Open post: ${title}`}
          >
            {image}
          </button>
          <button
            className={`save-overlay ${saved ? 'is-saved' : ''}`}
            onClick={save}
            aria-label={`${saved ? 'Unsave' : 'Save'} post by ${author.name}`}
            aria-pressed={saved}
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
                : people.find((user) => user.id === item.authorId);
            return (
              <article className="comment" key={item.id}>
                <Avatar person={person} size="small" />
                <div>
                  <h3>{person.name}</h3>
                  <p>{item.text}</p>
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
            <button className="icon-button" aria-label="Send comment">
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
