'use strict';
// Screen information stays on this device. No model fingerprint or private data scan.
const fullButtons = [...document.querySelectorAll('.fullscreenButton')];
function fullscreenActive() {
  return document.fullscreenElement || document.webkitFullscreenElement;
}
function fullscreenMessage(message) {
  for (const el of document.querySelectorAll('.fullscreenStatus')) el.textContent = message;
}
function fullscreenLabels() {
  for (const b of fullButtons) {
    b.hidden = false;
    const text = fullscreenActive() ? 'Exit full screen' : 'Full screen';
    b.textContent = b.id === 'quickFullscreen' ? (fullscreenActive() ? '↙' : '⛶') : text;
    b.setAttribute('aria-label', text);
    b.title = text;
  }
  screenFitStatus();
}
function screenFitStatus() {
  const v = viewportSize();
  const el = document.querySelector('#screenFitStatus');
  if (el)
    el.textContent =
      'Fitted to ' +
      v.w +
      ' × ' +
      v.h +
      ' · ' +
      (v.w > v.h ? 'landscape' : 'portrait') +
      ' · ' +
      (fullscreenActive() ? 'full screen' : 'browser view') +
      '. Camera and controls update when you rotate.';
}
function fitPhoneScreen() {
  clearControls();
  userZoom = 1;
  resize();
  window.dispatchEvent?.(new Event('resize'));
  screenFitStatus();
}
for (const b of fullButtons)
  b.onclick = async () => {
    clearControls();
    try {
      if (fullscreenActive()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        await exit.call(document);
      } else {
        const root = document.documentElement,
          request = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!request) throw new Error('Unavailable');
        await request.call(root, { navigationUI: 'hide' });
      }
      fullscreenMessage('');
      fitPhoneScreen();
    } catch (e) {
      fullscreenMessage(
        'Full screen is blocked or unavailable in this browser. Open the game directly in your phone’s browser. On iPhone, try Safari’s Share → Add to Home Screen → Open as Web App if offered. The game still fits the available screen.'
      );
      if (state === 'play' && !paused) togglePause();
    }
    fullscreenLabels();
  };
document.querySelector('#fitPhoneScreen').onclick = fitPhoneScreen;
document.addEventListener('fullscreenchange', () => {
  clearControls();
  fullscreenLabels();
});
document.addEventListener('webkitfullscreenchange', fullscreenLabels);
window.addEventListener('resize', screenFitStatus);
window.visualViewport?.addEventListener('resize', screenFitStatus);
fullscreenLabels();
// Rotation can interrupt a gesture without a clean pointer-up on some devices.
window.addEventListener('orientationchange', () => {
  clearControls();
  if (state === 'play' && !paused) togglePause();
});
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest?.('#game,#touch,#hud')) e.preventDefault();
});
