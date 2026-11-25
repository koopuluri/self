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
  let scale = 1, opening: Animation | undefined;
  function zoomAt(next: number, clientX?: number, clientY?: number) {
    if (!image.naturalWidth) return;
    opening?.cancel();
    const before = image.getBoundingClientRect();
    if (!before.width || !before.height) return;
    const x = clientX ?? before.left + before.width / 2;
    const y = clientY ?? before.top + before.height / 2;
    const u = (x - before.left) / before.width, v = (y - before.top) / before.height;
    scale = Math.min(16, Math.max(1, next));
    stage.style.setProperty('--image-scale', String(scale));
    stage.classList.toggle('zoomed', scale > 1);
    zoom.setAttribute('aria-label', scale > 1 ? 'Zoom out' : 'Zoom in');
    const after = image.getBoundingClientRect();
    stage.scrollBy(after.left + u * after.width - x, after.top + v * after.height - y);
  }
  zoom.onclick = event => zoomAt(scale > 1 ? 1 : Math.max(2, image.naturalWidth / image.offsetWidth),
    event.detail ? event.clientX : undefined, event.detail ? event.clientY : undefined);
  // Chromium delivers a Mac trackpad pinch as a ctrl-wheel gesture. Leave
  // ordinary two-finger scrolling to the stage so it retains native momentum.
  stage.addEventListener('wheel', event => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
    zoomAt(scale * Math.exp(-event.deltaY * unit / 100), event.clientX, event.clientY);
  }, { passive: false });
  // Scale the fitted canvas too. Its gutters leave room to keep an off-center
  // detail under the pointer even while the image is narrower than the stage.
  const canvas = document.createElement('div');
  canvas.className = 'image-canvas';
  zoom.append(image); canvas.append(zoom); stage.append(canvas); viewer.body.append(stage);
  const start = thumbnail.getBoundingClientRect();
  const animate = () => {
    if (!image.naturalWidth) return;
    image.style.setProperty('--natural-width', image.naturalWidth + 'px');
    image.style.setProperty('--aspect', String(image.naturalWidth / image.naturalHeight));
    if (!dialog.open || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const end = image.getBoundingClientRect();
    if (!end.width) return;
    opening = image.animate([{ transformOrigin: 'top left', transform: `translate(${start.x - end.x}px,${start.y - end.y}px) scale(${start.width / end.width})` }, { transformOrigin: 'top left', transform: 'none' }], { duration: 220, easing: 'ease-out' });
  };
  if (image.complete) animate(); else image.onload = animate;
}
