import { Home, Compass, Bookmark, Bell, UserRound, Search, Plus, X } from 'lucide-react';
import { Avatar, Brand } from './ui.jsx';

export const navigation = [
  { name: 'Home', label: 'Feed', icon: Home },
  { name: 'Explore', label: 'Explore', icon: Compass },
  { name: 'Bookmarks', label: 'Saved', icon: Bookmark },
  { name: 'Notifications', label: 'Activity', icon: Bell },
  { name: 'Profile', label: 'Profile', icon: UserRound },
];

export default function Layout({
  view,
  profile,
  unread,
  query,
  onSearch,
  navigate,
  onCompose,
  onSearchDialog,
  children,
}) {
  function navLink(item, mobile = false) {
    const Icon = item.icon;
    return (
      <a
        key={item.name}
        href={`#${item.name.toLowerCase()}`}
        aria-label={item.name}
        aria-current={view === item.name ? 'page' : undefined}
        className={`nav-link ${view === item.name ? 'active' : ''}`}
        onClick={(event) => {
          event.preventDefault();
          navigate(item.name);
        }}
      >
        {mobile && <Icon size={21} strokeWidth={1.8} />}
        <span>{item.label}</span>
      </a>
    );
  }

  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content').focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand-link"
            href="#home"
            aria-label="Forma home"
            onClick={(event) => {
              event.preventDefault();
              navigate('Home');
            }}
          >
            <Brand />
          </a>
          <nav className="desktop-nav" aria-label="Main navigation">
            {navigation.slice(0, 3).map((item) => navLink(item))}
          </nav>
          <form
            className="search-form"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              navigate('Explore', false);
            }}
          >
            <Search size={17} />
            <label className="sr-only" htmlFor="global-search">
              Search Forma
            </label>
            <input
              id="global-search"
              value={query}
              placeholder="Search ideas, people…"
              autoComplete="off"
              maxLength={100}
              onChange={(event) => onSearch(event.target.value)}
            />
            {query && (
              <button
                className="icon-button"
                type="button"
                aria-label="Clear search"
                onClick={() => onSearch('')}
              >
                <X size={15} />
              </button>
            )}
          </form>
          <div className="header-actions">
            <button
              className="icon-button mobile-search"
              aria-label="Open search"
              onClick={onSearchDialog}
            >
              <Search size={21} />
            </button>
            <button
              className="primary-button create-button"
              onClick={onCompose}
              aria-label="Create a post"
            >
              <Plus size={18} />
              <span>Create a post</span>
            </button>
            <a
              className="icon-button notification-link"
              href="#notifications"
              aria-label="Notifications"
              aria-current={view === 'Notifications' ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate('Notifications');
              }}
            >
              <Bell size={21} />
              {unread > 0 && <span className="notification-dot" aria-label={`${unread} unread`} />}
            </a>
            <button
              className="avatar-button"
              onClick={() => navigate('Profile')}
              aria-label="Your profile"
            >
              <Avatar person={profile} size="small" />
            </button>
          </div>
        </div>
      </header>
      <main id="main-content" className="main-canvas" tabIndex={-1}>
        {children}
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map((item) => navLink(item, true))}
      </nav>
    </>
  );
}
