// How it works: the whole app explained on one short page, in simple words.

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { pageHead, section, tick } from '../ui/parts.js';
import { NAV } from '../nav.js';

const WHERE = {
  today: 'What is now and next. Tick your blocks, water, protein, journal.',
  week: 'Your whole week. Locked blocks are faded. Tap a block to change it.',
  food: 'What to eat, what you ate, your food money and the grocery list.',
  body: 'Training logs, strength sessions, the weight chart and the targets.',
  learn: 'The one track you are learning now, its modules and your sessions.',
  create: 'Sketches, studies, visits, design challenges and your idea bank.',
  mind: 'Reading, your journal history and the optional modules.',
  habits: 'Every do and don’t with its percentage, and the unlock stages.',
  review: 'The Sunday review, the monthly charts and the backup.',
  settings: 'Your profile, your times, reminders, backup and reset.',
};

const mark = (status, title, text) => h('div', { class: 'guide-mark' },
  tick(status, { label: title, disabled: true }),
  h('div', {}, h('b', {}, title), h('p', {}, text)),
);

const steps = (...lines) => h('ol', { class: 'guide-steps' }, lines.map((line) => h('li', {}, line)));

export function guide(root) {
  root.append(
    pageHead({ eyebrow: 'Mind and Body', title: 'How it works', thin: 'two minutes' }),
    h('div', { class: 'two-col' },
      h('div', { class: 'col' },
        section({ no: '01', title: 'The idea' },
          h('p', { class: 'guide-text' }, 'This app runs your program. It shows what to do now, and it counts what you kept.'),
          h('p', { class: 'guide-text' }, 'It starts small. New things arrive in stages, only when the current ones hold. So you never change ten things at once.'),
        ),
        section({ no: '02', title: 'Every day' },
          steps(
            'Open Today. The card at the top shows what is now and what is next.',
            'When a block is done, tap its square.',
            'Tap the name of a block for more choices: the minimum version, skipped, or move it to another time.',
            'Bad day? Press "Bad day". Every block shows its small version. Doing the small version counts.',
            'In the evening, write three lines: one win, one lesson, and the number 1 for tomorrow.',
          ),
        ),
        section({ no: '03', title: 'The three marks' },
          mark('done', 'Done', 'You did the full version.'),
          mark('min', 'Minimum', 'You did the small version. It counts as kept.'),
          mark('skip', 'Skipped', 'You did not do it. Once is fine.'),
          mark(null, 'Open', 'Not logged yet. If it stays open, it counts as missed the next day.'),
        ),
        section({ no: '04', title: 'The rules' },
          steps(
            'Missing once is neutral. No guilt.',
            'Missing the same thing two times in a row shows a warning on Today. Do the minimum to clear it.',
            'Every two weeks a new stage can unlock. It needs 80% kept over the last 14 days. If not, the app waits one more week.',
            'Work, free time, football and Rotaract never count against you.',
            'On Sunday the review asks for ONE change for next week. Not five.',
          ),
        ),
      ),
      h('div', { class: 'col' },
        section({ no: '05', title: 'Food in one minute' },
          steps(
            'Open Food. You see your calories and protein for today.',
            'For each meal: press "I ate this" if you ate what the plan says. Or press "Something else" and pick the foods.',
            'Foods are counted in portions: an egg, a palm of chicken, a plate of rice. No scale.',
            '"My plan" shows what to eat. "Shop" keeps your food money and the grocery list.',
          ),
        ),
        section({ no: '06', title: 'Where is what' },
          h('nav', { class: 'more-list is-flat', 'aria-label': 'All screens' },
            NAV.filter((n) => WHERE[n.id]).map((n) => h('a', { class: 'more-item', href: `#/${n.id}` },
              icon(n.icon, 22),
              h('span', { class: 'more-text' }, h('b', {}, n.label), h('small', {}, WHERE[n.id])),
              icon('right', 18),
            )),
          ),
        ),
        section({ no: '07', title: 'Keep your data' },
          h('p', { class: 'guide-text' }, 'Everything you enter stays on this phone. Nothing is sent anywhere.'),
          h('p', { class: 'guide-text' }, 'A phone can lose its data. Download a backup every Sunday, at the end of the review or in Settings, and keep the file somewhere else.'),
        ),
      ),
    ),
  );
}
