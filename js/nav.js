// The navigation: a bottom bar on a phone (4 screens + More), a sidebar on a desktop.

import { h } from './ui/dom.js';
import { icon, logo } from './ui/icons.js';

// The four screens used every day are in the bottom bar. Everything else is under More.
// To change the bar, move `primary: true` to other lines (keep four).
export const NAV = [
  { id: 'today', label: 'Today', icon: 'today', primary: true },
  { id: 'week', label: 'Schedule', icon: 'week', primary: true },
  { id: 'food', label: 'Food', icon: 'food', primary: true },
  { id: 'body', label: 'Training', icon: 'body', primary: true },
  { id: 'guide', label: 'How it works', icon: 'help', hint: 'The app explained in two minutes' },
  { id: 'learn', label: 'Learn', icon: 'learn', hint: 'Dynamo, Navisworks, AI lab, sessions' },
  { id: 'create', label: 'Create', icon: 'create', hint: 'Sketches, studies, design challenges, ideas' },
  { id: 'mind', label: 'Mind', icon: 'mind', hint: 'Reading, journal, optional modules' },
  { id: 'habits', label: 'Habits', icon: 'habits', hint: "Do and don't, adherence, unlock status" },
  { id: 'review', label: 'Review', icon: 'review', hint: 'Weekly, monthly and phase reviews' },
  { id: 'settings', label: 'Settings', icon: 'settings', hint: 'Profile, times, backup, calendar' },
];

const PRIMARY = NAV.filter((n) => n.primary);
const SECONDARY = NAV.filter((n) => !n.primary);

export function buildNav(side, tabs) {
  side.replaceChildren(
    h('a', { class: 'brand', href: '#/today' },
      logo(34),
      h('span', { class: 'brand-name' }, 'Mind', h('br'), 'and Body'),
    ),
    h('nav', { class: 'side-nav', 'aria-label': 'Main' },
      PRIMARY.map((n) => h('a', { href: `#/${n.id}`, 'data-nav': n.id }, icon(n.icon, 20), n.label)),
      h('p', { class: 'side-group eyebrow' }, 'More'),
      SECONDARY.map((n) => h('a', { href: `#/${n.id}`, 'data-nav': n.id }, icon(n.icon, 20), n.label)),
    ),
  );
  tabs.replaceChildren(
    ...PRIMARY.map((n) => h('a', { class: 'tab', href: `#/${n.id}`, 'data-nav': n.id }, icon(n.icon, 22), h('span', {}, n.label))),
    h('a', { class: 'tab', href: '#/more', 'data-nav': 'more' }, icon('more', 22), h('span', {}, 'More')),
  );
}

// Mark the current screen. On a phone the secondary screens light up "More".
export function markNav(routeName) {
  const isSecondary = SECONDARY.some((n) => n.id === routeName);
  for (const a of document.querySelectorAll('[data-nav]')) {
    const id = a.dataset.nav;
    const inTabs = a.classList.contains('tab');
    const on = id === routeName || (inTabs && id === 'more' && isSecondary);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

export { SECONDARY };
