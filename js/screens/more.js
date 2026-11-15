// More: the list of the other screens (phone only; the desktop sidebar shows them all).

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead } from '../ui/parts.js';
import { SECONDARY } from '../nav.js';

export function more(root) {
  root.append(
    pageHead({ eyebrow: 'Mind and Body', title: 'More' }),
    h('nav', { class: 'more-list', 'aria-label': 'More screens' },
      SECONDARY.map((n) => h('a', { class: 'more-item', href: `#/${n.id}` },
        icon(n.icon, 22),
        h('span', { class: 'more-text' }, h('b', {}, n.label), h('small', {}, n.hint)),
        icon('right', 18),
      )),
    ),
  );
}
