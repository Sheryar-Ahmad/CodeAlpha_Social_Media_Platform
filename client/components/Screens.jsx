import { useState } from 'react';
import { ArrowUpRight, Check, Settings2, ShieldCheck, Sun, Moon, Plus } from 'lucide-react';
import { people, topics, notifications } from '../data/seed.js';
import { validateProfile } from '../lib/state.js';
import { Avatar, FollowButton } from './ui.jsx';
import { PageHeading } from './Feed.jsx';
import { TopicIcon } from './Graphics.jsx';

export function Explore({ state, onTopic, onFollow, query, onPerson = null }) {
  const term = query.trim().toLowerCase();
  const matches = (state.people || people).filter(
    (person) =>
      !term || `${person.name} ${person.handle} ${person.role}`.toLowerCase().includes(term),
  );
  return (
    <>
      <PageHeading
        eyebrow="FOLLOW YOUR CURIOSITY"
        title={
          query ? (
            `Results for “${query}”`
          ) : (
            <>
              A fresh <span>perspective.</span>
            </>
          )
        }
        description={
          query
            ? 'Search across ideas, people, and topics.'
            : 'Explore ideas, learning, and everyday perspectives.'
        }
      />
      {!query && (
        <>
          <section className="topic-collection" aria-label="Explore topics">
            {topics.map((topic) => (
              <button
                className="topic-card"
                key={topic.name}
                data-topic={topic.name}
                onClick={() => onTopic(topic.name, true)}
              >
                <div className="topic-card-media">
                  <img src={topic.image} alt="" width="500" height="350" />
                  <span className="topic-card-symbol">
                    <TopicIcon topic={topic.name} size={18} />
                  </span>
                </div>
                <span>
                  <strong>{topic.name}</strong>
                  <ArrowUpRight size={18} />
                </span>
                <p>{topic.description}</p>
              </button>
            ))}
          </section>
        </>
      )}
      {matches.length > 0 && (
        <section className="people-section" aria-label="Creators">
          <div className="section-heading">
            <h2>{query ? 'People matching your search' : 'People worth knowing'}</h2>
            <span>{matches.length} creators</span>
          </div>
          <div className="people-grid">
            {matches.map((person) => (
              <article className="person-card" key={person.id}>
                <Avatar person={person} />
                <div>
                  <h3>
                    {onPerson ? (
                      <button className="author-name" onClick={() => onPerson(person.id)}>
                        {person.name}
                      </button>
                    ) : (
                      person.name
                    )}
                  </h3>
                  <p>{person.role}</p>
                </div>
                <FollowButton
                  person={person}
                  following={state.following.includes(person.id)}
                  onFollow={onFollow}
                  pending={state.busy}
                />
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function Profile({
  state,
  onEdit,
  onSettings,
  onCompose,
  person = null,
  own = true,
  onFollow,
  onLogout,
  onAccount,
  onBlock,
  onReport,
  error = '',
}) {
  if (!own && !person)
    return (
      <p className="muted" role="status">
        {error ? 'This profile could not be loaded.' : 'Loading profile…'}
      </p>
    );
  const profile = person || state.profile;
  return (
    <>
      <section className="profile-heading">
        <Avatar person={profile} size="large" />
        <div className="profile-info">
          <p className="eyebrow">YOUR CREATIVE SPACE</p>
          <h1>{profile.name}</h1>
          <p className="profile-handle">@{profile.handle}</p>
          <p className="profile-bio">{profile.bio}</p>
          <div className="profile-stats">
            <span>
              <strong>
                {profile.postCount ?? state.posts.filter((post) => post.authorId === 'you').length}
              </strong>{' '}
              posts
            </span>
            <span>
              <strong>{own ? state.following.length : profile.followingCount}</strong> following
            </span>
            <span>
              <strong>{own ? state.saved.length : profile.followerCount}</strong>{' '}
              {own ? 'saved' : 'followers'}
            </span>
          </div>
        </div>
        <div className="profile-actions">
          {!own ? (
            <>
              <FollowButton
                person={profile}
                following={state.following.includes(profile.id)}
                onFollow={onFollow}
                pending={state.busy}
              />
              {onBlock && (
                <button className="text-button" onClick={() => onBlock(profile)}>
                  Block member
                </button>
              )}
              {onReport && (
                <button className="text-button" onClick={() => onReport(profile)}>
                  Report member
                </button>
              )}
            </>
          ) : (
            <>
              <button className="secondary-button" onClick={onEdit}>
                Edit profile
              </button>
              {onLogout && (
                <button className="secondary-button" onClick={onLogout} disabled={state.busy}>
                  Sign out
                </button>
              )}
            </>
          )}
          {own && onAccount && (
            <button
              className="icon-button"
              onClick={onAccount}
              aria-label="Account settings"
              title="Account settings"
            >
              <ShieldCheck size={20} />
            </button>
          )}
          <button className="icon-button" onClick={onSettings} aria-label="Open preferences">
            <Settings2 size={20} />
          </button>
        </div>
      </section>
      <div className="section-heading">
        <h2>{own ? 'Your work & ideas' : 'Work & ideas'}</h2>
        <button className="text-button" onClick={onCompose}>
          Create a post <Plus size={16} />
        </button>
      </div>
    </>
  );
}

export function Activity({ state, dispatch, onOpen, onPerson, notify, mode = 'demo' }) {
  const items = state.notifications || notifications;
  const unread = items.length - state.readNotifications.length;
  return (
    <div className="activity-screen">
      <PageHeading
        eyebrow="KEEP THE CONVERSATION GOING"
        title={
          <>
            Your <span>activity.</span>
          </>
        }
        description="Conversations and perspectives from your community."
      />
      <div className="section-heading">
        <h2>{unread ? `${unread} unread updates` : 'You’re all caught up'}</h2>
        <button
          className="text-button"
          disabled={!unread}
          onClick={async () => {
            if (!(await dispatch({ type: 'read' }))) return;
            notify('All updates marked as read.');
          }}
        >
          <Check size={16} />
          Mark all as read
        </button>
      </div>
      <section className="notification-list" aria-label="Activity updates">
        {items.map((item) => {
          const person = (state.people || people).find((user) => user.id === item.personId) || {
            name: 'Former member',
          };
          const isUnread = !state.readNotifications.includes(item.id);
          return (
            <article key={item.id} className={`notification-item ${isUnread ? 'unread' : ''}`}>
              <Avatar person={person} />
              <div>
                <p>
                  <strong>{person.name}</strong> {item.text}
                </p>
                <p className="notification-detail">{item.detail}</p>
                <span>{item.time}</span>
                <button
                  className="text-button"
                  onClick={() => (item.postId ? onOpen(item.postId) : onPerson(person.id))}
                >
                  {item.postId ? 'View conversation' : 'View profile'} <ArrowUpRight size={15} />
                </button>
              </div>
              {isUnread && <span className="unread-indicator" aria-label="Unread" />}
            </article>
          );
        })}
      </section>
      {mode === 'demo' ? (
        <p className="demo-footnote">
          Sample activity from fictional creators in this local preview.
        </p>
      ) : (
        items.length === 0 && (
          <p className="muted">New follows, likes, and replies will appear here.</p>
        )
      )}
    </div>
  );
}

export function EditProfile({ profile, onSave, pending = false }) {
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    const issue = validateProfile(name, bio);
    if (issue) {
      setError(issue);
      return;
    }
    onSave(name, bio);
  }
  return (
    <form className="edit-form" onSubmit={submit}>
      <label htmlFor="profile-name">Display name</label>
      <input
        id="profile-name"
        value={name}
        maxLength={60}
        onChange={(event) => setName(event.target.value)}
      />
      <label htmlFor="profile-bio">About you</label>
      <textarea
        id="profile-bio"
        value={bio}
        maxLength={160}
        rows={4}
        onChange={(event) => setBio(event.target.value)}
      />
      <p className="input-hint">
        {bio.length} / 160 · @{profile.handle}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'} <Check size={17} />
      </button>
    </form>
  );
}

export function Preferences({ state, dispatch }) {
  return (
    <div className="preferences">
      <h3>Appearance</h3>
      <div className="appearance-options">
        {[
          { name: 'light', icon: Sun },
          { name: 'dark', icon: Moon },
        ].map(({ name, icon: Icon }) => (
          <button
            key={name}
            className={state.theme === name ? 'chosen' : ''}
            aria-pressed={state.theme === name}
            disabled={state.busy}
            onClick={() => dispatch({ type: 'theme', value: name })}
          >
            <Icon size={24} />
            <span>{name === 'light' ? 'Light' : 'Dark'}</span>
            {state.theme === name && <Check size={17} />}
          </button>
        ))}
      </div>
      <p className="input-hint">
        {state.profile.id ? 'Saved to your account.' : 'Saved in this browser.'} Motion follows your
        device’s accessibility settings.
      </p>
    </div>
  );
}

export function Interests({ state, dispatch }) {
  return (
    <div className="interest-panel">
      <p>Choose what you want to see more of. You can change these anytime.</p>
      <div className="interest-options">
        {topics.map((topic) => {
          const selected = state.interests.includes(topic.name);
          return (
            <button
              key={topic.name}
              className={selected ? 'selected' : ''}
              disabled={state.busy}
              aria-pressed={selected}
              onClick={() =>
                dispatch({
                  type: 'interests',
                  values: selected
                    ? state.interests.filter((name) => name !== topic.name)
                    : [...state.interests, topic.name],
                })
              }
            >
              <span>
                <strong>{topic.name}</strong>
                <small>{topic.description}</small>
              </span>
              {selected ? <Check size={20} /> : <Plus size={20} />}
            </button>
          );
        })}
      </div>
      <section className="ranking-explanation">
        <h3>How your feed works</h3>
        <p>
          Selected interests come first, followed by creators you follow. Saved and liked topics add
          a small signal. Recent work gets a boost, and different creators get room to be seen.
        </p>
        <p>
          Choose <strong>Latest</strong> for chronological order or <strong>Following</strong> for
          just your people. No interests selected? You’ll see a broader mix.
        </p>
      </section>
    </div>
  );
}

export function NewCollection({ collections, onCreate, pending = false }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Give your collection a name.');
      return;
    }
    if (collections.length >= 20) {
      setError('You can create up to 20 collections.');
      return;
    }
    if (collections.some((item) => item.name.toLowerCase() === name.trim().toLowerCase())) {
      setError('You already have a collection with this name.');
      return;
    }
    onCreate(name.trim());
  }
  return (
    <form className="edit-form" onSubmit={submit}>
      <label htmlFor="collection-name">Collection name</label>
      <input
        id="collection-name"
        value={name}
        maxLength={30}
        placeholder="e.g. Ideas for my next project"
        onChange={(event) => setName(event.target.value)}
      />
      <p className="input-hint">
        Save a post, open it, and choose a collection to keep it organized.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={pending}>
        {pending ? 'Creating…' : 'Create collection'} <Plus size={17} />
      </button>
    </form>
  );
}
