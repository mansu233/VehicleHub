/* =========================================================================
   MANSKIT Vehicle Hub — Pinch & Zoom Photo Viewer
   Attaches pinch-to-zoom, drag-to-pan, double-tap-to-zoom and mouse-wheel
   zoom to an <img>. Listeners are bound to the image itself (not the
   surrounding frame/container) so tapping or dragging the dark backdrop
   around the photo does nothing but close the viewer, as expected.
   No external libraries.
   ========================================================================= */

function attachPinchZoom(containerEl, imgEl) {
  // apply()/clamp() need fresh state on every open (each photo starts
  // un-zoomed), but the event listeners themselves should only ever be
  // wired up once per <img> element — otherwise re-opening the viewer
  // repeatedly stacks duplicate handlers and the gestures compound.
  if (!imgEl._zoomState) {
    imgEl._zoomState = { scale: 1, originX: 0, originY: 0 };
  }
  const state = imgEl._zoomState;
  state.scale = 1; state.originX = 0; state.originY = 0;

  if (imgEl._zoomAttached) { applyTransform(); return; }
  imgEl._zoomAttached = true;

  let startDist = 0, startScale = 1;
  let dragging = false, lastX = 0, lastY = 0;
  let lastTapTime = 0;

  function clamp() {
    state.scale = Math.min(4, Math.max(1, state.scale));
    const maxOffsetX = (containerEl.clientWidth * (state.scale - 1)) / 2;
    const maxOffsetY = (containerEl.clientHeight * (state.scale - 1)) / 2;
    state.originX = Math.min(maxOffsetX, Math.max(-maxOffsetX, state.originX));
    state.originY = Math.min(maxOffsetY, Math.max(-maxOffsetY, state.originY));
    if (state.scale === 1) { state.originX = 0; state.originY = 0; }
  }

  function applyTransform() {
    clamp();
    imgEl.style.transform = `translate(${state.originX}px, ${state.originY}px) scale(${state.scale})`;
  }

  function dist(touches) {
    const [a, b] = touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  // Gesture listeners live on the image element itself. Per the touch-event
  // spec, a touch's target stays fixed to whatever element it started on
  // even as the finger moves outside that element's box — so a pinch begun
  // on the photo keeps tracking correctly even if fingers drift onto the
  // frame during the gesture, while a tap that starts on the frame never
  // triggers anything here.
  imgEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      startDist = dist(e.touches);
      startScale = state.scale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapTime < 300) {
        state.scale = state.scale > 1 ? 1 : 2.4;
        applyTransform();
      }
      lastTapTime = now;
      dragging = state.scale > 1;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    }
  }, { passive: true });

  imgEl.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const newDist = dist(e.touches);
      state.scale = startScale * (newDist / startDist);
      applyTransform();
    } else if (e.touches.length === 1 && dragging) {
      e.preventDefault();
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      state.originX += dx; state.originY += dy;
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      applyTransform();
    }
  }, { passive: false });

  imgEl.addEventListener('touchend', () => { dragging = false; });

  // Desktop: wheel to zoom (photo only), drag to pan once zoomed in
  imgEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.scale += e.deltaY < 0 ? 0.2 : -0.2;
    applyTransform();
  }, { passive: false });

  let mouseDown = false;
  imgEl.addEventListener('mousedown', (e) => {
    if (state.scale <= 1) return;
    e.preventDefault();
    mouseDown = true; lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('mousemove', (e) => {
    if (!mouseDown) return;
    state.originX += e.clientX - lastX; state.originY += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    applyTransform();
  });
  window.addEventListener('mouseup', () => { mouseDown = false; });

  imgEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    state.scale = state.scale > 1 ? 1 : 2.4;
    applyTransform();
  });

  // Tapping the frame/backdrop around the photo (not the photo itself)
  // closes the viewer, same as tapping the ✕ button.
  containerEl.addEventListener('click', (e) => {
    if (e.target === containerEl) closeZoomViewer();
  });

  applyTransform();
}
