const frame = document.getElementById('marimoFrame');
const fallback = document.getElementById('marimoFallback');
const reloadBtn = document.getElementById('reloadFrameBtn');

const MARIMO_ENTRY = 'marimo_dist/index.html';

function showFrame() {
  fallback.style.display = 'none';
  frame.style.display = 'block';
}

function showFallback() {
  frame.style.display = 'none';
  fallback.style.display = 'flex';
}

async function loadMarimoFrame() {
  showFallback();

  try {
    const response = await fetch(`${MARIMO_ENTRY}?check=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
      showFallback();
      return;
    }

    frame.src = `${MARIMO_ENTRY}?cache=${Date.now()}`;
    showFrame();
  } catch (_) {
    showFallback();
  }
}

reloadBtn.addEventListener('click', loadMarimoFrame);
loadMarimoFrame();
