import Lenis from 'lenis';

const TOTAL_FRAMES = 240;
const FRAME_PATH = (index) => `./frames/frame_${String(index).padStart(6, '0')}.jpg`;

// Touch / Device Detection
const isTouchDevice = () => {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches
  );
};

// DOM Elements
const canvas = document.getElementById('animation-canvas');
const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
const loader = document.getElementById('loader');
const loaderPercent = document.getElementById('loader-percent');
const loaderBar = document.getElementById('loader-bar');
const siteHeader = document.querySelector('.site-header');
const scrollProgressBar = document.getElementById('scroll-progress-bar');

// Mobile Menu Elements
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const mobileNavDrawer = document.getElementById('mobile-nav-drawer');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

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
let lastRenderTime = 0;
let isMobileMenuOpen = false;

// 1. Initialize Smooth Scroll with Lenis (Optimized for Android, Tablets & 120Hz/60Hz Displays)
let lenis;
let targetProgress = 0;

try {
  const isTouch = isTouchDevice();
  lenis = new Lenis({
    duration: isTouch ? 0.45 : 0.75,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 1.0,
    touchMultiplier: 1.0,
    syncTouch: false,
    autoRaf: false,
  });

  lenis.on('scroll', (e) => {
    if (typeof e.progress === 'number' && !isNaN(e.progress)) {
      targetProgress = Math.max(0, Math.min(1, e.progress));
    }
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

// Mobile Menu Open/Close Controls
function toggleMobileMenu(forceState) {
  const nextState = typeof forceState === 'boolean' ? forceState : !isMobileMenuOpen;
  isMobileMenuOpen = nextState;

  if (mobileMenuToggle) {
    mobileMenuToggle.classList.toggle('active', isMobileMenuOpen);
    mobileMenuToggle.setAttribute('aria-expanded', String(isMobileMenuOpen));
  }

  if (mobileNavDrawer) {
    mobileNavDrawer.classList.toggle('active', isMobileMenuOpen);
    mobileNavDrawer.setAttribute('aria-hidden', String(!isMobileMenuOpen));
  }

  if (isMobileMenuOpen) {
    document.body.classList.add('mobile-menu-open');
    if (lenis && typeof lenis.stop === 'function') lenis.stop();
  } else {
    document.body.classList.remove('mobile-menu-open');
    if (lenis && typeof lenis.start === 'function') lenis.start();
  }
}

mobileMenuToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMobileMenu();
});

// Close mobile menu when clicking any nav link
mobileNavLinks.forEach((link) => {
  link.addEventListener('click', () => {
    toggleMobileMenu(false);
  });
});

// Close mobile menu on outside click or escape
document.addEventListener('click', (e) => {
  if (isMobileMenuOpen && mobileNavDrawer && !mobileNavDrawer.contains(e.target) && !mobileMenuToggle?.contains(e.target)) {
    toggleMobileMenu(false);
  }
});

// Smooth anchor scrolling for all internal hash links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const href = anchor.getAttribute('href');
    if (href === '#' || !href) return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      toggleMobileMenu(false);

      const headerOffset = window.innerWidth <= 768 ? 70 : 80;
      if (lenis && typeof lenis.scrollTo === 'function') {
        lenis.scrollTo(target, { offset: -headerOffset, duration: 0.85 });
      } else {
        const top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
  });
});

// 2. Resize Canvas Handling (Clamped DPR for Optimal Fillrate on Mobile GPUs)
function resizeCanvas() {
  const isMobile = window.innerWidth <= 768;
  const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5);
  const displayWidth = window.innerWidth;
  const displayHeight = window.innerHeight;

  const targetWidth = Math.round(displayWidth * dpr);
  const targetHeight = Math.round(displayHeight * dpr);

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = isMobile ? 'low' : 'medium';
    needsForcedRedraw = true;
  }
}

// 3. Aspect Ratio Cover Drawing with Pixel Rounding for Max Performance
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

  ctx.drawImage(
    img,
    Math.round(offsetX),
    Math.round(offsetY),
    Math.round(renderWidth),
    Math.round(renderHeight)
  );
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
  if (images[index] && images[index].isReady) return images[index];

  return new Promise((resolve) => {
    const img = new Image();
    img.src = FRAME_PATH(index);

    const onReady = async () => {
      try {
        if ('decode' in img) {
          await img.decode();
        }
      } catch {
        // Safe decode fallback
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

  // Hide loader early once initial keyframes are ready for instant responsiveness
  if (loadedCount >= Math.min(12, TOTAL_FRAMES)) {
    hideLoader();
  }
}

// Global safety timeout to ensure loader never hangs on slow cellular networks
setTimeout(hideLoader, 1200);

// 7. Progressive Concurrent Batch Preloading (Prioritized Keyframe Loading)
async function preloadFrames() {
  // Step 1: Immediately fetch and render Frame 1
  const firstFrame = await loadSingleFrame(1);
  if (firstFrame) {
    isFirstFrameReady = true;
    resizeCanvas();
    drawFrame(firstFrame);
  }

  // Step 2: Load initial 18 sequential frames and keyframe stepping (every 6th frame) for responsive scrub
  const priorityQueue = [];
  for (let i = 2; i <= 18; i++) {
    priorityQueue.push(i);
  }
  for (let i = 24; i <= TOTAL_FRAMES; i += 6) {
    if (!priorityQueue.includes(i)) priorityQueue.push(i);
  }

  const isMobile = isTouchDevice() || window.innerWidth <= 768;
  const initialConcurrency = isMobile ? 6 : 10;

  const priorityWorkers = Array.from({ length: initialConcurrency }, async () => {
    while (priorityQueue.length > 0) {
      const frameIndex = priorityQueue.shift();
      if (frameIndex !== undefined && !images[frameIndex]?.isReady) {
        await loadSingleFrame(frameIndex);
      }
    }
  });

  await Promise.all(priorityWorkers);
  hideLoader();

  // Step 3: Load remaining frames in background with controlled concurrency
  const remainingQueue = [];
  for (let i = 2; i <= TOTAL_FRAMES; i++) {
    if (!images[i]?.isReady) {
      remainingQueue.push(i);
    }
  }

  const backgroundConcurrency = isMobile ? 3 : 6;
  const bgWorkers = Array.from({ length: backgroundConcurrency }, async () => {
    while (remainingQueue.length > 0) {
      const frameIndex = remainingQueue.shift();
      if (frameIndex !== undefined) {
        await loadSingleFrame(frameIndex);
        // Small yield to keep UI frame thread unblocked
        await new Promise((r) => setTimeout(r, 8));
      }
    }
  });

  await Promise.all(bgWorkers);
}

// 8. Animation & Render Loop with Direct Delta-Time Damping (Zero Lag, Silky 120Hz/60Hz)
function render(time) {
  if (lenis && typeof lenis.raf === 'function') {
    lenis.raf(time);
  }

  // Header glass state toggle on scroll
  const scrollY = window.scrollY || window.pageYOffset || 0;
  if (scrollY > 30) {
    siteHeader?.classList.add('scrolled');
  } else {
    siteHeader?.classList.remove('scrolled');
  }

  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  let progress = targetProgress;
  if (lenis && typeof lenis.progress === 'number' && !isNaN(lenis.progress) && lenis.progress >= 0) {
    progress = Math.max(0, Math.min(1, lenis.progress));
  } else {
    progress = Math.max(0, Math.min(1, scrollY / maxScroll));
  }

  // Top scroll progress bar
  if (scrollProgressBar) {
    scrollProgressBar.style.width = `${progress * 100}%`;
  }

  targetFrame = 1 + progress * (TOTAL_FRAMES - 1);

  // Time-delta normalized exponential damping tuned for instantaneous tracking without lag
  const dt = lastRenderTime ? Math.min((time - lastRenderTime) / 1000, 0.05) : 0.016;
  lastRenderTime = time;

  const damping = 1 - Math.exp(-28 * dt);
  currentFrame += (targetFrame - currentFrame) * damping;

  // Snap to target if within micro-threshold to eliminate redundant repaints
  if (Math.abs(targetFrame - currentFrame) < 0.02) {
    currentFrame = targetFrame;
  }

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
    toggleMobileMenu(false);
    closeModal();
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
    toggleCertsText.textContent = isCertsExpanded ? 'SHOW LESS' : 'SHOW ALL CERTIFICATES & BADGES (17+)';
  }
  if (lenis && typeof lenis.resize === 'function') {
    lenis.resize();
  }
});

certFilterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    certFilterBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    // Scroll active chip into view horizontally on mobile
    btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

    const filter = btn.getAttribute('data-filter');

    if (filter === 'all') {
      if (certExpandWrap) certExpandWrap.style.display = 'flex';
      certCards.forEach((card) => {
        card.classList.remove('hidden');
      });
    } else {
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

// 11. Modal Handlers for Certificates & Legal Terms (Mobile & Tablet Optimized)
function openModal(src, title, type, previewSrc) {
  if (!certModal) return;
  modalTitle.textContent = title || 'Document';
  if (modalDownload) {
    modalDownload.href = src;
    modalDownload.setAttribute('download', title || 'document');
  }
  modalBody.innerHTML = '';

  const isMobile = window.innerWidth <= 768;

  if (type === 'image') {
    const img = document.createElement('img');
    img.src = src;
    img.alt = title || 'Certificate Preview';
    img.loading = 'eager';
    modalBody.appendChild(img);
  } else if (type === 'pdf') {
    // On Android/mobile browsers, native iframe PDF embedding can be unsupported or cramped.
    // Provide a rich responsive image preview with a direct 1-tap view action.
    if (isMobile && previewSrc) {
      const wrap = document.createElement('div');
      wrap.className = 'modal-mobile-pdf-wrap';

      const img = document.createElement('img');
      img.src = previewSrc;
      img.alt = title || 'Certificate Document Preview';
      img.className = 'modal-mobile-preview-img';

      const actionBtn = document.createElement('a');
      actionBtn.href = src;
      actionBtn.target = '_blank';
      actionBtn.rel = 'noopener';
      actionBtn.className = 'btn-pill modal-mobile-pdf-btn';
      actionBtn.innerHTML = `<span>VIEW FULL DOCUMENT (PDF)</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>`;

      wrap.appendChild(img);
      wrap.appendChild(actionBtn);
      modalBody.appendChild(wrap);
    } else {
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = title || 'Document Viewer';
      modalBody.appendChild(iframe);
    }
  }

  certModal.classList.add('active');
  certModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  if (lenis && typeof lenis.stop === 'function') lenis.stop();
}

function closeModal() {
  if (!certModal) return;
  certModal.classList.remove('active');
  certModal.setAttribute('aria-hidden', 'true');
  modalBody.innerHTML = '';
  document.body.style.overflow = '';
  if (lenis && typeof lenis.start === 'function') lenis.start();
}

document.querySelectorAll('.cert-card').forEach((card) => {
  card.addEventListener('click', () => {
    const src = card.getAttribute('data-src');
    const title = card.getAttribute('data-title');
    const type = card.getAttribute('data-type') || 'pdf';
    const thumbImg = card.querySelector('.cert-thumb-img');
    const previewSrc = thumbImg ? thumbImg.src : null;
    if (src) {
      openModal(src, title, type, previewSrc);
    }
  });
});

// Legal Notice PDF Modal Trigger
legalPdfLink?.addEventListener('click', (e) => {
  e.preventDefault();
  openModal('./legal-notice.pdf', 'Intellectual Property, Copyright & Legal Terms Notice — Aryan Sharma', 'pdf', './portfolio_thumbnail.png');
});

modalClose?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', closeModal);

// 12. Contact Form Interactive Submission
contactForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const originalHtml = submitBtn.innerHTML;
  submitBtn.innerHTML = `<span>SENDING...</span>`;
  submitBtn.disabled = true;

  setTimeout(() => {
    submitBtn.innerHTML = originalHtml;
    submitBtn.disabled = false;
    formFeedback.textContent = '✓ Thank you! Your message has been sent to Aryan Sharma.';
    formFeedback.className = 'form-feedback success';
    contactForm.reset();

    setTimeout(() => {
      formFeedback.className = 'form-feedback';
    }, 5000);
  }, 900);
});

// 13. Dynamic Viewport, Orientation & Resize Handlers
let resizeDebounceTimer;
function handleResize() {
  clearTimeout(resizeDebounceTimer);
  resizeDebounceTimer = setTimeout(() => {
    resizeCanvas();
    if (lenis && typeof lenis.resize === 'function') {
      lenis.resize();
    }
  }, 100);
}

window.addEventListener('resize', handleResize, { passive: true });
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    resizeCanvas();
    if (lenis && typeof lenis.resize === 'function') {
      lenis.resize();
    }
  }, 150);
});

window.addEventListener('DOMContentLoaded', () => {
  resizeCanvas();
  preloadFrames();
  requestAnimationFrame(render);
});
