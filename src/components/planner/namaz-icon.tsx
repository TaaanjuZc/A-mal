import { createLucideIcon } from 'lucide-react';

const solid = { fill: 'currentColor', stroke: 'none' };

/** The one Namaz icon (mosque dome) used across nav, dashboard, reminders and the Namaz page. */
export const NamazIcon = createLucideIcon('namaz', [
  ['path', { d: 'M11.5 1A3 3 0 1 0 15.1 4.3A2.7 2.7 0 0 1 11.5 1Z', ...solid, key: 'crescent' }],
  ['rect', { x: '11.7', y: '6.4', width: '0.6', height: '1.6', ...solid, key: 'finial' }],
  ['path', { d: 'M4.6 19.45C3.4 16.5 3.6 13.2 6.6 11C9.2 9.2 11.2 8.6 12 7.5C12.8 8.6 14.8 9.2 17.4 11C20.4 13.2 20.6 16.5 19.4 19.45Z', ...solid, key: 'dome' }],
  ['rect', { x: '3.75', y: '20.25', width: '16.5', height: '2.35', rx: '0.7', ...solid, key: 'base' }],
]);
