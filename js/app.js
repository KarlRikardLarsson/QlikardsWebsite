/* ===== QLIKARD — App Logic ===== */

const NEW_DAYS = 14; // posts within this many days get a "New" badge

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isNew(iso) {
  return (Date.now() - new Date(iso).getTime()) < NEW_DAYS * 86400000;
}

function tagHTML(category, inline = false) {
  const cat = CATEGORIES[category] || CATEGORIES.general;
  return `<span class="tag ${cat.color}${inline ? ' tag-inline' : ''}">${cat.label}</span>`;
}

function sortedPosts(filter = 'all', query = '') {
  let list = filter === 'all' ? POSTS : POSTS.filter(p => p.category === filter);
  if (query) {
    const q = query.toLowerCase();
    list = list.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.excerpt.toLowerCase().includes(q) ||
      CATEGORIES[p.category].label.toLowerCase().includes(q)
    );
  }
  return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ── Featured post (homepage top) ──────────────────────────────────────────────

function renderFeatured(post) {
  const el = document.getElementById('featured-post');
  if (!el) return;
  if (!post) { el.innerHTML = ''; el.hidden = true; return; }

  el.hidden = false;
  const cat = CATEGORIES[post.category];
  el.innerHTML = `
    <div class="featured-label">Latest post</div>
    <a class="featured-link" href="${post.file}">
      <div class="featured-meta">
        ${tagHTML(post.category)}
        <span class="featured-date">${formatDate(post.date)}</span>
        <span class="featured-read">${post.readTime} min read</span>
      </div>
      <h2 class="featured-title">${post.title}</h2>
      <p class="featured-excerpt">${post.excerpt}</p>
      <span class="featured-cta">Read post →</span>
    </a>`;
}

// ── Post list ─────────────────────────────────────────────────────────────────

function postItemHTML(post, skipId = null) {
  if (post.id === skipId) return '';
  const newBadge = isNew(post.date) ? '<span class="badge-new">New</span>' : '';
  return `
    <article class="post-item cat-${post.category}">
      <div class="post-item-left">
        <div class="post-item-top">
          ${tagHTML(post.category, true)}
          ${newBadge}
        </div>
        <h3><a href="${post.file}">${post.title}</a></h3>
        <p class="excerpt">${post.excerpt}</p>
      </div>
      <div class="post-item-right">
        <span class="date">${formatDate(post.date)}</span>
        <span class="read-time">${post.readTime} min</span>
      </div>
    </article>`;
}

let currentFilter = 'all';
let currentQuery  = '';

function render() {
  const posts = sortedPosts(currentFilter, currentQuery);
  const grid  = document.getElementById('posts-grid');
  const featuredSection = document.getElementById('featured-post');
  if (!grid) return;

  const searching = currentQuery.length > 0;
  const filtering = currentFilter !== 'all';

  // Show featured only when browsing All with no search
  const showFeatured = !searching && !filtering;
  const featuredPost = showFeatured ? posts[0] : null;
  renderFeatured(featuredPost);

  // List (skip featured post when it's shown separately)
  const skipId = showFeatured && featuredPost ? featuredPost.id : null;
  const listPosts = posts.filter(p => p.id !== skipId);

  if (listPosts.length === 0 && !showFeatured) {
    grid.innerHTML = `<p class="empty-state">${
      searching ? `No posts matching "<strong>${currentQuery}</strong>"` : 'No posts in this category yet — coming soon.'
    }</p>`;
    return;
  }

  grid.innerHTML = listPosts.map(p => postItemHTML(p)).join('');
}

// ── Counts ────────────────────────────────────────────────────────────────────

function renderCounts() {
  const total = document.getElementById('count-all');
  if (total) total.textContent = POSTS.length;
  Object.keys(CATEGORIES).forEach(key => {
    const el = document.getElementById(`count-${key}`);
    const n = POSTS.filter(p => p.category === key).length;
    if (el) el.textContent = n || '';
  });
  const heroCount = document.getElementById('hero-post-count');
  if (heroCount) heroCount.textContent = POSTS.length;
}

// ── Search ────────────────────────────────────────────────────────────────────

function initSearch() {
  const input = document.getElementById('search-input');
  if (!input) return;
  input.addEventListener('input', e => {
    currentQuery = e.target.value.trim();
    // Reset category pill when searching
    if (currentQuery) {
      currentFilter = 'all';
      document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
      const all = document.querySelector('.cat-pill[data-filter="all"]');
      if (all) all.classList.add('active');
    }
    render();
  });
}

// ── Category filter ───────────────────────────────────────────────────────────

function filterCategory(cat, el) {
  currentFilter = cat;
  currentQuery = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  render();
}

// ── Related posts (post pages) ────────────────────────────────────────────────

function renderRelated() {
  const container = document.getElementById('related-posts');
  if (!container) return;

  const meta = document.querySelector('meta[name="post-id"]');
  const currentId = meta ? meta.content : null;
  const metaCat = document.querySelector('meta[name="post-category"]');
  const currentCat = metaCat ? metaCat.content : null;

  if (!currentCat) return;

  const related = POSTS
    .filter(p => p.category === currentCat && p.id !== currentId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 3);

  if (related.length === 0) return;

  container.innerHTML = `
    <div class="related-section">
      <p class="section-label">More in ${CATEGORIES[currentCat].label}</p>
      <div class="related-list">
        ${related.map(p => `
          <a class="related-item" href="../${p.file}">
            <span class="related-title">${p.title}</span>
            <span class="related-meta">${p.readTime} min · ${formatDate(p.date)}</span>
          </a>`).join('')}
      </div>
    </div>`;
}

// ── Reading progress bar (post pages) ─────────────────────────────────────────

function initProgressBar() {
  if (!document.querySelector('.post-layout')) return;
  const bar = document.createElement('div');
  bar.id = 'progress-bar';
  document.body.prepend(bar);
  window.addEventListener('scroll', () => {
    const scrolled = document.documentElement.scrollTop;
    const total = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = total > 0 ? (scrolled / total * 100) + '%' : '0%';
  }, { passive: true });
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  render();
  renderCounts();
  initSearch();
  initProgressBar();
  renderRelated();

  // Highlight active nav link
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href').split('#')[0];
    if (href === page) a.classList.add('active');
  });
});
