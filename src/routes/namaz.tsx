import { createFileRoute } from '@tanstack/react-router';
import { NamazPage } from '@/components/planner/namaz';
export const Route = createFileRoute('/namaz')({
 head: () => ({ meta: [{title: 'Namaz — Wajib'}, {name:'description',content:'Daily prayer times calculated for your location, with gentle reminders.'}, {property:'og:title',content:'Namaz — Wajib'}, {property:'og:description',content:'Daily prayer times calculated for your location, with gentle reminders.'}, {property:'og:type',content:'website'}, {name:'twitter:card',content:'summary_large_image'}] }),
 component: NamazPage,
});
