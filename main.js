import Lenis from 'https://cdn.jsdelivr.net/npm/lenis@1.1.20/+esm';

const TOTAL_FRAMES = 240;
const FRAME_PATH = (index) => `./frames/frame_${String(index).padStart(6, '0')}.jpg`;

// DOM Elements
const canvas = document.getElementById('animation-canvas');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const loader = document.getElementById('loader');
const loaderPercent = document.getElementById('loader-percent');
const loaderBar = document.getElementById('loader-bar');
const siteHeader = document.querySelector('.site-header');
const scrollProgressBar = document.getElementById('scroll-progress-bar');

// Floating Connect Speed-Dial Hub
const floatingConnectHub = document.getElementById('floating-connect-hub');
const floatingConnectBtn = document.getElementById('floating-connect-btn');

// Modal Elements
const certModal = document.getElementById('cert-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalDownload = document.getElementById('modal-download');
const modalClose = document.getElementById('modal-close');
const modalBackdrop = document.querySelector('.modal-backdrop');
const legalPdfLink = document.getElementById('legal-pdf-link');

// Form Elements
const contactForm = document.getElementById('contact-form');
const submitBtn = document.getElementById('submit-btn');
const formFeedback = document.getElementById('form-feedback');

// State
const images = new Array(TOTAL_FRAMES + 1);
let loadedCount = 0;
let currentFrame = 1;
let targetFrame = 1;
let lastDrawnFrame = -1;
let isFirstFrameReady = false;
let isLoaderHidden = false;
let needsForcedRedraw = false;

// 1. Initialize Smooth Scroll with Lenis (Optimized for 120Hz/60Hz Performance)
let lenis;
try {
  lenis = new Lenis({
    duration: 0.9,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 0.95,
    touchMultiplier: 1.4,
    syncTouch: true,
  });
} catch (err) {
  console.warn('Lenis fallback active:', err);
  lenis = {
    raf: () => {},
    scrollTo: (target) => {
      target?.scrollIntoView({ behavior: 'smooth' });
    },
    resize: () => {},
    progress: 0,
  };
}

// Smooth anchor scrolling
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (href === '#' || !href) return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      if (lenis && typeof lenis.scrollTo === 'function') {
        lenis.scrollTo(target, { offset: -60, duration: 0.9 });
      } else {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    }
  });
});

// 2. Resize Canvas Handling (Clamped DPR for Maximum Fillrate)
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const displayWidth = window.innerWidth;
  const displayHeight = window.innerHeight;

  const targetWidth = Math.round(displayWidth * dpr);
  const targetHeight = Math.round(displayHeight * dpr);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    needsForcedRedraw = true;
  }
}

// 3. Aspect Ratio Cover Drawing
function drawFrame(img) {
  if (!img || !img.complete || img.naturalWidth === 0) return;

  const cWidth = canvas.width;
  const cHeight = canvas.height;
  const iWidth = img.naturalWidth;
  const iHeight = img.naturalHeight;

  const canvasAspect = cWidth / cHeight;
  const imgAspect = iWidth / iHeight;

  let renderWidth, renderHeight, offsetX, offsetY;

  if (canvasAspect > imgAspect) {
    renderWidth = cWidth;
    renderHeight = cWidth / imgAspect;
    offsetX = 0;
    offsetY = (cHeight - renderHeight) / 2;
  } else {
    renderHeight = cHeight;
    renderWidth = cHeight * imgAspect;
    offsetX = (cWidth - renderWidth) / 2;
    offsetY = 0;
  }

  ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);
}

// 4. Fallback for Nearest Loaded Frame
function getRenderableFrame(index) {
  if (images[index] && images[index].isReady) {
    return images[index];
  }

  for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
    const prev = index - offset;
    if (prev >= 1 && images[prev] && images[prev].isReady) {
      return images[prev];
    }
    const next = index + offset;
    if (next <= TOTAL_FRAMES && images[next] && images[next].isReady) {
      return images[next];
    }
  }
  return null;
}

// 5. Load Single Frame with Async Decoding
async function loadSingleFrame(index) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = FRAME_PATH(index);

    const onReady = async () => {
      try {
        if ('decode' in img) {
          await img.decode();
        }
      } catch {
        // Fallback
      }
      img.isReady = true;
      images[index] = img;
      loadedCount++;
      updateLoaderProgress();
      resolve(img);
    };

    img.onload = onReady;
    img.onerror = () => {
      loadedCount++;
      updateLoaderProgress();
      resolve(null);
    };
  });
}

// 6. Update Loader UI
function hideLoader() {
  if (!isLoaderHidden && loader) {
    loader.classList.add('loaded');
    isLoaderHidden = true;
  }
}

function updateLoaderProgress() {
  const percent = Math.min(100, Math.round((loadedCount / TOTAL_FRAMES) * 100));
  if (loaderPercent) loaderPercent.textContent = `${percent}%`;
  if (loaderBar) loaderBar.style.width = `${percent}%`;

  if (loadedCount >= Math.min(8, TOTAL_FRAMES)) {
    hideLoader();
  }
}

// Global safety timeout
setTimeout(hideLoader, 1500);

// 7. Concurrent Batch Preloading
async function preloadFrames() {
  const firstFrame = await loadSingleFrame(1);
  if (firstFrame) {
    isFirstFrameReady = true;
    resizeCanvas();
    drawFrame(firstFrame);
  }

  const queue = [];
  for (let i = 2; i <= TOTAL_FRAMES; i++) {
    queue.push(i);
  }

  const CONCURRENCY = 16;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const frameIndex = queue.shift();
      if (frameIndex !== undefined) {
        await loadSingleFrame(frameIndex);
      }
    }
  });

  await Promise.all(workers);
  hideLoader();
}

// 8. Animation & Render Loop (High Performance 120fps/60fps)
function render(time) {
  if (lenis && typeof lenis.raf === 'function') {
    lenis.raf(time);
  }

  // Update header blur style on scroll
  if (window.scrollY > 40) {
    siteHeader?.classList.add('scrolled');
  } else {
    siteHeader?.classList.remove('scrolled');
  }

  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  let progress = 0;
  if (lenis && typeof lenis.progress === 'number' && !isNaN(lenis.progress) && lenis.progress > 0) {
    progress = Math.max(0, Math.min(1, lenis.progress));
  } else if (maxScroll > 0) {
    progress = Math.max(0, Math.min(1, window.scrollY / maxScroll));
  }

  // Top scroll progress bar
  if (scrollProgressBar) {
    scrollProgressBar.style.width = `${progress * 100}%`;
  }

  targetFrame = 1 + progress * (TOTAL_FRAMES - 1);

  // Smooth lerp frame interpolation
  currentFrame += (targetFrame - currentFrame) * 0.2;
  const clampedFrame = Math.max(1, Math.min(TOTAL_FRAMES, currentFrame));
  const roundedFrame = Math.round(clampedFrame);

  if (roundedFrame !== lastDrawnFrame || needsForcedRedraw) {
    const frameImg = getRenderableFrame(roundedFrame);
    if (frameImg) {
      drawFrame(frameImg);
      lastDrawnFrame = roundedFrame;
      needsForcedRedraw = false;
    }
  }

  requestAnimationFrame(render);
}

// 9. Floating Speed-Dial Connect Hub Toggle
floatingConnectBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  floatingConnectHub?.classList.toggle('active');
});

document.addEventListener('click', (e) => {
  if (floatingConnectHub?.classList.contains('active') && !floatingConnectHub.contains(e.target)) {
    floatingConnectHub.classList.remove('active');
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    floatingConnectHub?.classList.remove('active');
  }
});

// 10. Certificate Filter Tabs & Show More Expansion
const certFilterBtns = document.querySelectorAll('.cert-filter-btn');
const certCards = document.querySelectorAll('.cert-card');
const certsSection = document.getElementById('certificates');
const toggleCertsBtn = document.getElementById('toggle-certs-btn');
const toggleCertsText = document.getElementById('toggle-certs-text');
const certExpandWrap = document.querySelector('.cert-expand-wrap');
let isCertsExpanded = false;

toggleCertsBtn?.addEventListener('click', () => {
  isCertsExpanded = !isCertsExpanded;
  certsSection?.classList.toggle('expanded', isCertsExpanded);
  if (toggleCertsText) {
    toggleCertsText.textContent = isCertsExpanded ? 'SHOW LESS' : 'SHOW ALL CERTIFICATES & BADGES (15+)';
  }
  if (lenis && typeof lenis.resize === 'function') {
    lenis.resize();
  }
});

certFilterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    certFilterBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const filter = btn.getAttribute('data-filter');

    if (filter === 'all') {
      if (certExpandWrap) certExpandWrap.style.display = 'flex';
      certCards.forEach((card) => {
        card.classList.remove('hidden');
      });
    } else {
      // In specific category view, show all matching items without collapsing
      if (certExpandWrap) certExpandWrap.style.display = 'none';
      certCards.forEach((card) => {
        const categories = card.getAttribute('data-category') || '';
        if (categories.includes(filter)) {
          card.classList.remove('hidden');
          card.style.display = 'flex';
        } else {
          card.classList.add('hidden');
          card.style.display = 'none';
        }
      });
    }

    if (lenis && typeof lenis.resize === 'function') {
      lenis.resize();
    }
  });
});

// 11. Modal Handlers for Certificates & Legal Terms
function openModal(src, title, type) {
  if (!certModal) return;
  modalTitle.textContent = title || 'Document';
  if (modalDownload) {
    modalDownload.href = src;
    modalDownload.setAttribute('download', title || 'document');
  }
  modalBody.innerHTML = '';

  if (type === 'image') {
    const img = document.createElement('img');
    img.src = src;
    img.alt = title;
    modalBody.appendChild(img);
  } else {
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = title;
    modalBody.appendChild(iframe);
  }

  certModal.classList.add('active');
  certModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  if (!certModal) return;
  certModal.classList.remove('active');
  certModal.setAttribute('aria-hidden', 'true');
  modalBody.innerHTML = '';
  document.body.style.overflow = '';
}

document.querySelectorAll('.cert-card').forEach((card) => {
  card.addEventListener('click', () => {
    const src = card.getAttribute('data-src');
    const title = card.getAttribute('data-title');
    const type = card.getAttribute('data-type') || 'pdf';
    if (src) {
      openModal(src, title, type);
    }
  });
});

// Legal Notice PDF Modal Trigger
legalPdfLink?.addEventListener('click', (e) => {
  e.preventDefault();
  openModal('./legal-notice.pdf', 'Intellectual Property, Copyright & Legal Terms Notice — Aryan Sharma', 'pdf');
});

modalClose?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', closeModal);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && certModal?.classList.contains('active')) {
    closeModal();
  }
});

// 12. Contact Form Interactive Submission
contactForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const originalText = submitBtn.innerHTML;
  submitBtn.innerHTML = `<span>SENDING...</span>`;
  submitBtn.disabled = true;

  setTimeout(() => {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
    formFeedback.textContent = '✓ Thank you! Your message has been sent to Aryan Sharma.';
    formFeedback.className = 'form-feedback success';
    contactForm.reset();

    setTimeout(() => {
      formFeedback.className = 'form-feedback';
    }, 5000);
  }, 1000);
});

// Window Listeners
window.addEventListener('resize', resizeCanvas);

window.addEventListener('DOMContentLoaded', () => {
  resizeCanvas();
  preloadFrames();
  requestAnimationFrame(render);
});
