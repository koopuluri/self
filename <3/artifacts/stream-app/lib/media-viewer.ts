import { blockViewer } from './block-viewer';
export function openImage(thumbnail: HTMLImageElement, trigger: HTMLElement) {
  const viewer = blockViewer(thumbnail.alt, () => trigger.focus({ preventScroll: true }));
  const { dialog } = viewer;
  dialog.classList.add('image-viewer');
  const stage = document.createElement('div');
  stage.className = 'image-stage';
  const image = new Image();
  image.src = thumbnail.currentSrc;
  image.alt = thumbnail.alt;
  const zoom = document.createElement('button');
  zoom.className = 'image-zoom';
  zoom.setAttribute('aria-label', 'Zoom in');
  zoom.onclick = event => {
    const fit = image.getBoundingClientRect();
    const x = event.detail ? (event.clientX - fit.left) / fit.width : 0.5;
    const y = event.detail ? (event.clientY - fit.top) / fit.height : 0.5;
    const enlarged = stage.classList.toggle('zoomed');
    image.style.width = enlarged ? Math.max(image.naturalWidth, fit.width * 2) + 'px' : '';
    if (enlarged) {
      stage.scrollLeft = x * image.offsetWidth - stage.clientWidth / 2;
      stage.scrollTop = y * image.offsetHeight - stage.clientHeight / 2;
    }
    zoom.setAttribute('aria-label', enlarged ? 'Zoom out' : 'Zoom in');
  };
  zoom.append(image); stage.append(zoom); viewer.body.append(stage);
  const start = thumbnail.getBoundingClientRect();
  const animate = () => {
    if (!dialog.open || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const end = image.getBoundingClientRect();
    if (!end.width) return;
    image.animate([{ transformOrigin: 'top left', transform: `translate(${start.x - end.x}px,${start.y - end.y}px) scale(${start.width / end.width})` }, { transformOrigin: 'top left', transform: 'none' }], { duration: 220, easing: 'ease-out' });
  };
  if (image.complete) animate(); else image.onload = animate;
}
