/**
 * ====================================================
 *  QLIKARD — POSTS DATABASE
 * ====================================================
 *  To add a new post:
 *  1. Copy post-template.html to posts/your-slug.html
 *  2. Fill in the content
 *  3. Add an entry to the POSTS array below
 * ====================================================
 */

const CATEGORIES = {
  scripts:  { label: 'Scripts',        color: 'scripts'  },
  viz:      { label: 'Visualizations', color: 'viz'      },
  automate: { label: 'Qlik Automate',  color: 'automate' },
  general:  { label: 'General Tips',   color: 'general'  },
};

const POSTS = [
  {
    id: 'progress-bar-in-table',
    title: 'How to Create a Progress Bar Inside a Qlik Table',
    excerpt: 'No extensions needed. Build an inline bar column using an HTML expression and one setting change — Representation set to Text.',
    category: 'viz',
    date: '2026-04-03',
    file: 'posts/progress-bar-in-table.html',
    readTime: 5,
  },
  {
    id: 'build-null-table',
    title: 'BuildNullTable — Handle Missing Dimension Keys Automatically',
    excerpt: 'Fact rows with no matching dimension key show as NULL in dashboards. This subroutine adds a clean catch-all row to every dimension table in one call — no manual field wiring needed.',
    category: 'scripts',
    date: '2026-04-03',
    file: 'posts/build-null-table.html',
    readTime: 6,
  },
  {
    id: 'calendar-script-benchmark',
    title: 'Calendar Scripts — Which One Is Fastest?',
    excerpt: 'Three common ways to build a master calendar in Qlik — benchmarked. The RESIDENT min/max approach averaged 14 seconds every run. The FieldValue methods were essentially instant.',
    category: 'scripts',
    date: '2026-04-07',
    file: 'posts/calendar-becnhmark.html',
    readTime: 6,
  },
  {
    id: 'mapping-table-autoconcatenate',
    title: 'Mapping Tables Auto-Concatenate — and That Can Bite You',
    excerpt: 'Concatenate() throws an error on mapping tables — but naming two MAPPING LOADs the same silently merges them. Useful trick, dangerous trap. And there\'s a DROP MAPPING TABLE statement most people don\'t know about.',
    category: 'scripts',
    date: '2026-04-08',
    file: 'posts/mapping-table-autoconcatenate.html',
    readTime: 5,
  },
  {
    id: 'date-filter-benchmark',
    title: 'Stop Using >= for Date Filters — Use WHERE EXISTS Instead',
    excerpt: 'WHERE TransactionDate >= \'$(vDate)\' is one of the most common patterns in Qlik scripts — but it\'s not the fastest. A temp calendar with WHERE EXISTS beat it by 25% on 10M rows. And there\'s a naming trap that silently kills the advantage.',
    category: 'scripts',
    date: '2026-04-08',
    file: 'posts/date-filter-benchmark.html',
    readTime: 8,
  },
  {
    id: 'applymap-existence-trick',
    title: 'ApplyMap with 1 — The Existence Check Trick (and How to Make It Faster)',
    excerpt: 'One of my favourite Qlik patterns: mapping distinct keys to 1 for fast existence checks in incremental loads. Plus a benchmark showing FieldValue + AutoGenerate beats DISTINCT on 10M rows.',
    category: 'scripts',
    date: '2026-04-03',
    file: 'posts/applymap-existence-trick.html',
    readTime: 7,
  },
];
