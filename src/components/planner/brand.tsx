export const APP_NAME = 'A’mal';

export function AmalMark({ size = 24, className }: { size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="296 267 440 440" fill="currentColor" aria-hidden className={className}>
    <path d="M318 577H505C545 577 580 560 605 525V600C580 640 550 664 510 664H318Z" />
    <path d="M622 447L705 398V664H622Z" />
    <path d="M656 291L715 350L656 409L597 350Z" />
  </svg>;
}
