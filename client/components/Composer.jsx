import { useRef, useState } from 'react';
import { ImagePlus, ArrowUpRight, X } from 'lucide-react';
import { Avatar } from './ui.jsx';
import { topics } from '../data/seed.js';
import { MAX_IMAGE_SIZE, MAX_POST_LENGTH, validatePost } from '../lib/state.js';

export default function Composer({ profile, onPublish, initialPost = null, pending = false }) {
  const [title, setTitle] = useState(initialPost?.title || '');
  const [text, setText] = useState(initialPost?.text || '');
  const [image, setImage] = useState(initialPost?.image || null);
  const [imageAlt, setImageAlt] = useState(initialPost?.imageAlt || '');
  const [topic, setTopic] = useState(initialPost?.topic || 'Design');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function addImage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Choose a JPG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Choose an image smaller than 2 MB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await new Promise((resolve, reject) => {
        const probe = new Image();
        probe.onload = resolve;
        probe.onerror = reject;
        probe.src = data;
      });
      setImage(data);
      setImageAlt('');
    } catch {
      setError('This image could not be opened. Try another file.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    const issue = validatePost(text, image, imageAlt, title);
    if (issue) {
      setError(issue);
      return;
    }
    await onPublish({
      title: title.trim(),
      text: text.trim(),
      image,
      imageAlt: imageAlt.trim(),
      topic,
    });
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-identity">
        <Avatar person={profile} size="small" />
        <div>
          <strong>{profile.name}</strong>
          <span>Sharing with the community</span>
        </div>
      </div>
      <label htmlFor="post-title">
        Title <span className="optional">optional</span>
      </label>
      <input
        id="post-title"
        value={title}
        maxLength={80}
        placeholder="Give your idea a name"
        onChange={(event) => setTitle(event.target.value)}
      />
      <label htmlFor="post-text">What are you working on?</label>
      <textarea
        id="post-text"
        value={text}
        rows={4}
        maxLength={600}
        aria-describedby="post-count"
        placeholder="Share a thought, a work in progress, or something useful you learned."
        onChange={(event) => {
          setText(event.target.value);
          setError('');
        }}
      />
      <p
        id="post-count"
        className={`character-count ${text.trim().length > MAX_POST_LENGTH ? 'over-limit' : ''}`}
      >
        {text.trim().length} / {MAX_POST_LENGTH}
      </p>
      {image && (
        <div className="attachment">
          <img src={image} alt={imageAlt || 'Your selected photo'} />
          <button
            type="button"
            className="icon-button remove-image"
            aria-label="Remove photo"
            onClick={() => {
              setImage(null);
              setImageAlt('');
            }}
          >
            <X size={18} />
          </button>
          <label htmlFor="post-alt">
            Photo description <span className="optional">required</span>
          </label>
          <input
            id="post-alt"
            value={imageAlt}
            maxLength={160}
            placeholder="Describe what is in the photo"
            onChange={(event) => setImageAlt(event.target.value)}
          />
        </div>
      )}
      <div className="composer-options">
        <input
          className="sr-only"
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={addImage}
          tabIndex={-1}
          aria-label="Choose a photo"
        />
        <button
          type="button"
          className="secondary-button"
          onClick={() => fileRef.current.click()}
          disabled={busy}
        >
          <ImagePlus size={18} />
          {busy ? 'Reading photo…' : image ? 'Change photo' : 'Add a photo'}
        </button>
        <label className="topic-select" htmlFor="post-topic">
          <span>Topic</span>
          <select id="post-topic" value={topic} onChange={(event) => setTopic(event.target.value)}>
            {topics.map((item) => (
              <option key={item.name}>{item.name}</option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <footer className="composer-footer">
        <p>Make it yours. Make it useful.</p>
        <button className="primary-button" disabled={busy || pending}>
          {pending ? 'Saving…' : initialPost ? 'Save changes' : 'Publish post'}{' '}
          <ArrowUpRight size={17} />
        </button>
      </footer>
    </form>
  );
}
