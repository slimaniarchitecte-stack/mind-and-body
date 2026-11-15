// Line icons, drawn by hand for this app. 24 x 24 grid, 1.6 stroke.

import { svg } from './dom.js';

const PATHS = {
  today: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.2V12l3.2 2"/>',
  week: '<rect x="3.5" y="5" width="17" height="14.5" rx="1"/><path d="M3.5 9.5h17M9.2 9.5v10M14.8 9.5v10"/>',
  body: '<path d="M3.5 9.5v5M6.8 7v10M17.2 7v10M20.5 9.5v5M6.8 12h10.4"/>',
  learn: '<path d="M12 4l8.5 4.2L12 12.4 3.5 8.2 12 4z"/><path d="M3.5 12.2L12 16.4l8.5-4.2M3.5 16L12 20.2l8.5-4.2"/>',
  more: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
  food: '<path d="M4 11.5h16a8 8 0 0 1-16 0z"/><path d="M9.5 8c0-1.2 1-1.2 1-2.4M14 8c0-1.2 1-1.2 1-2.4"/>',
  create: '<path d="M5 19l1-4.2L16.6 4.3a2 2 0 0 1 2.9 2.9L9 17.8 5 19z"/><path d="M14.6 6.3l3 3"/>',
  mind: '<path d="M12 6.6c-2-1.3-4.6-1.6-7.5-1v12c2.9-.6 5.5-.3 7.5 1 2-1.3 4.6-1.6 7.5-1v-12c-2.9-.6-5.5-.3-7.5 1z"/><path d="M12 6.6v12"/>',
  habits: '<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/><path d="M8.4 12.3l2.5 2.5 4.8-5.4"/>',
  review: '<path d="M3.5 19.5h17M6.5 19.5v-7M11 19.5V5.5M15.5 19.5v-5M20 19.5V9"/>',
  settings: '<path d="M4 8h8.5M17.5 8H20M4 16h2.5M11.5 16H20"/><circle cx="15" cy="8" r="2.4"/><circle cx="9" cy="16" r="2.4"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.7a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.3 1-1.3 2.1M12 16.7v.3"/>',
  left: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  right: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  down: '<path d="M5.5 9.5L12 16l6.5-6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.6l4.4 4.4L19 7.4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  lock: '<rect x="6" y="11" width="12" height="8.5" rx="1.2"/><path d="M8.6 11V8.4a3.4 3.4 0 0 1 6.8 0V11"/>',
  move: '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  alert: '<path d="M12 4.2l9 15.3H3l9-15.3z"/><path d="M12 10v4.6M12 17.2v.3"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.8 7l.9 12.5h8.6L17.2 7"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 9.5v4l2.4 1.6M9.5 3.5h5"/>',
  photo: '<rect x="3.5" y="6" width="17" height="13" rx="1.2"/><circle cx="12" cy="12.5" r="3.2"/><path d="M8.5 6l1.2-2h4.6l1.2 2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  download: '<path d="M12 4v11M7.5 10.8L12 15.3l4.5-4.5M4.5 19.5h15"/>',
  upload: '<path d="M12 15.5V4.5M7.5 9L12 4.5 16.5 9M4.5 19.5h15"/>',
  search: '<circle cx="11" cy="11" r="6.2"/><path d="M15.6 15.6l4 4"/>',
  shuffle: '<path d="M3.5 7.5h3.2c5 0 5.6 9 10.6 9h3.2M17.8 13.8l2.7 2.7-2.7 2.7M3.5 16.5h3.2c1.6 0 2.7-.9 3.6-2.2M13.7 9.7c.9-1.3 2-2.2 3.6-2.2h3.2M17.8 4.800l2.7 2.7-2.7 2.7"/>',
};

export function icon(name, size = 22) {
  const body = PATHS[name] ?? '';
  return svg(
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`,
  );
}

// A calendar and heartbeat: plan the day and care for your health.
export function logo(size = 32) {
 return svg("<svg class=\"logo\" viewBox=\"0 0 64 64\" fill=\"none\" aria-hidden=\"true\"" + ' width="' + size + '" height="' + size + '">' + "<rect width=\"64\" height=\"64\" rx=\"13\" fill=\"#2B2D42\"/><rect x=\"10\" y=\"13\" width=\"44\" height=\"43\" rx=\"9\" stroke=\"#F5F5F5\" stroke-width=\"3.5\"/><path d=\"M21 8v11M43 8v11M11 25h42\" stroke=\"#F5F5F5\" stroke-width=\"3.5\" stroke-linecap=\"round\"/><path d=\"M17 40h7l5-9 6 17 5-8h7\" stroke=\"#C6FF00\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>");
}
