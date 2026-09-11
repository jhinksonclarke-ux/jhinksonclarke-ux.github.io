// Shader Jay portfolio: progressive enhancement for the one-page site.
// Without this script the page still works: the work section is a plain grid
// and every project image is visible.

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

initTheme();
initMenu();
initSectionSpy();
initHero();
const work = initWork();
initViewer(work);
initCopy();

// ---------------------------------------------------------------- theme

// Two states, as the guidance recommends: follow the system, or pin the opposite.
function initTheme() {
  const button = document.querySelector('.theme-toggle');
  const scheme = document.querySelector('meta[name="color-scheme"]');
  const themeColors = [...document.querySelectorAll('meta[name="theme-color"]')];
  const system = matchMedia('(prefers-color-scheme: dark)');
  const COLORS = { light: '#E6EBF0', dark: '#021A2B' };
  const effective = () => root.dataset.theme || (system.matches ? 'dark' : 'light');

  function render() {
    const theme = effective();
    root.dataset.themeState = theme;
    button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    for (const meta of themeColors) {
      const fallback = meta.media.includes('dark') ? 'dark' : 'light';
      meta.content = COLORS[root.dataset.theme || fallback];
    }
  }

  button.addEventListener('click', () => {
    const next = effective() === 'dark' ? 'light' : 'dark';
    const followsSystem = next === (system.matches ? 'dark' : 'light');
    try {
      if (followsSystem) localStorage.removeItem('color-scheme');
      else localStorage.setItem('color-scheme', next);
    } catch {}
    if (followsSystem) {
      delete root.dataset.theme;
      scheme.content = 'light dark';
    } else {
      root.dataset.theme = next;
      scheme.content = next;
    }
    render();
  });
  system.addEventListener('change', render);
  render();
}

// ---------------------------------------------------------------- navigation

function initMenu() {
  const button = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');
  const set = (open) => {
    button.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  };
  button.addEventListener('click', () => set(button.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      set(false);
      button.focus();
    }
  });
}

function initSectionSpy() {
  const links = [...document.querySelectorAll('.site-nav a')];
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const link of links) {
        if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      }
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  for (const id of ['top', 'work', 'brands', 'story', 'contact']) {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  }

  // A thin strip at the top of the viewport, roughly the header's height, so the
  // header restyles while it sits over the navy brands band.
  const header = document.querySelector('.site-header');
  new IntersectionObserver(([entry]) => {
    header.classList.toggle('is-on-navy', entry.isIntersecting);
  }, { rootMargin: '0px 0px -93% 0px' }).observe(document.getElementById('brands'));
}

// ---------------------------------------------------------------- hero

// The name tilts towards the pointer and its extrusion swings away from it,
// like turning a lit object in a viewport.
function initHero() {
  const name = document.querySelector('.hero__name');
  const hero = name?.closest('.hero');
  if (!hero || reduceMotion.matches || !finePointer.matches) return;

  let target = { x: 0, y: 0 };
  let now = { x: 0, y: 0 };
  let frame = 0;

  function tick() {
    now.x += (target.x - now.x) * 0.1;
    now.y += (target.y - now.y) * 0.1;
    name.style.setProperty('--tx', now.x.toFixed(4));
    name.style.setProperty('--ty', now.y.toFixed(4));
    const settled = Math.abs(target.x - now.x) < 0.001 && Math.abs(target.y - now.y) < 0.001;
    frame = settled ? 0 : requestAnimationFrame(tick);
  }
  const wake = () => { if (!frame) frame = requestAnimationFrame(tick); };

  hero.addEventListener('pointermove', (e) => {
    target = {
      x: clamp((e.clientX / innerWidth) * 2 - 1, -1, 1),
      y: clamp((e.clientY / innerHeight) * 2 - 1, -1, 1),
    };
    wake();
  });
  hero.addEventListener('pointerleave', () => {
    target = { x: 0, y: 0 };
    wake();
  });
}

// ---------------------------------------------------------------- work helix

function initWork() {
  const section = document.getElementById('work');
  const stage = section.querySelector('.work__stage');
  const track = section.querySelector('.helix__track');
  const all = [...track.querySelectorAll('.card')];
  const stepsBox = section.querySelector('.work__steps');
  const caption = section.querySelector('.work__caption');
  const capMeta = caption.querySelector('.caption__meta');
  const capTitle = caption.querySelector('.caption__title');
  const capDesc = caption.querySelector('.caption__desc');
  const capOpen = caption.querySelector('.caption__open');
  const counter = section.querySelector('.work__count');
  const status = section.querySelector('#work-status');
  const chips = [...section.querySelectorAll('.filter')];
  const prevButton = section.querySelector('[data-step="-1"]');
  const nextButton = section.querySelector('[data-step="1"]');
  const viewButtons = [...section.querySelectorAll('.view-toggle button')];
  const saveData = navigator.connection?.saveData === true;

  // Spiral by default; the grid when the system asks for reduced motion.
  // A visitor's own choice wins either way.
  let chosenView = null;
  try { chosenView = localStorage.getItem('work-view'); } catch {}
  const wantsHelix = () => (chosenView || (reduceMotion.matches ? 'grid' : 'helix')) === 'helix';

  let cards = all;
  let helix = false;
  let geo = null;
  let top = 0;
  let pos = 0;
  let active = -1;
  let frame = 0;
  let live = false;
  let preview = null;
  let previewTimer = 0;
  let drag = null;
  let suppressClick = false;

  const link = (card) => card.querySelector('.card__link');

  // Card images are sized for whichever layout is showing.
  const SIZES = {
    helix: '(min-width: 64em) min(22vw, 340px), 58vw',
    grid: '(min-width: 75em) 18rem, (min-width: 48em) 30vw, 90vw',
  };

  function setMode() {
    readTop();
    helix = wantsHelix();
    section.classList.toggle('is-helix', helix);
    for (const button of viewButtons) {
      button.setAttribute('aria-pressed', String((button.dataset.view === 'helix') === helix));
    }
    for (const el of track.querySelectorAll('source, img')) el.sizes = helix ? SIZES.helix : SIZES.grid;
    if (helix) {
      // Roving focus: only the front card sits in the tab order; arrows move it.
      for (const card of all) link(card).tabIndex = -1;
      active = -1;
      measure();
      render();
      return;
    }
    stopPreview();
    stepsBox.replaceChildren();
    track.style.transform = '';
    active = -1;
    for (const card of all) {
      card.style.transform = '';
      card.style.opacity = '';
      card.style.visibility = '';
      card.classList.remove('is-active', 'is-back');
      link(card).removeAttribute('tabindex');
    }
  }

  // Card size, radius and pitch all follow the viewport, so the spiral keeps
  // the same proportions from a small phone to a wide monitor.
  // Uses only the viewport size, so it can run straight after style changes
  // without forcing a layout.
  function measure() {
    const vw = innerWidth;
    const vh = innerHeight;
    const wide = vw >= 1024;
    const size = Math.round(wide
      ? clamp(Math.min(vw * 0.22, vh * 0.4), 200, 340)
      : clamp(Math.min(vw * 0.58, vh * 0.32), 150, 300));
    // Seven cards per turn with open gaps between them, and each turn dropping
    // a little more than a card's height, so the spiral reads as a spiral.
    const perTurn = 7;
    const radius = (size * 1.3 * perTurn) / (2 * Math.PI);
    const pitch = size * 0.21;
    const stepPx = Math.round(clamp(vh * 0.24, 140, 220));
    geo = { size, perTurn, radius, pitch, stepPx, stepDeg: 360 / perTurn };

    section.style.setProperty('--card', `${size}px`);
    section.style.setProperty('--step', `${stepPx}px`);
    section.style.setProperty('--persp', `${Math.round(radius * (wide ? 3.4 : 3))}px`);
    section.style.setProperty('--axis-left', wide ? '63%' : '50%');
    section.style.setProperty('--axis-top', wide ? '50%' : '55%');

    cards.forEach((card, k) => {
      card.style.transform = `rotateY(${k * geo.stepDeg}deg) translate3d(0, ${(k * pitch).toFixed(2)}px, ${radius.toFixed(1)}px)`;
    });
    if (stepsBox.children.length !== cards.length) {
      stepsBox.replaceChildren(...cards.map(() => Object.assign(document.createElement('div'), { className: 'work__step' })));
    }
  }

  // The section's offset only changes when the layout above it does (hero height
  // on resize), so it is read before any writes rather than on every measure.
  const readTop = () => { top = section.getBoundingClientRect().top + scrollY; };

  function render() {
    frame = 0;
    if (!helix || !cards.length) return;
    pos = clamp((scrollY - top) / geo.stepPx, 0, cards.length - 1);
    track.style.transform =
      `translate3d(0, ${(-pos * geo.pitch).toFixed(2)}px, ${(-geo.radius).toFixed(1)}px) rotateY(${(-pos * geo.stepDeg).toFixed(3)}deg)`;

    const turn = geo.pitch * geo.perTurn;
    for (let k = 0; k < cards.length; k++) {
      const offset = k - pos;
      const facing = Math.cos((offset * geo.stepDeg * Math.PI) / 180);
      const rise = Math.abs(offset) * geo.pitch;
      const fade = 1 - clamp((rise - turn * 1.05) / (turn * 0.75), 0, 1);
      const card = cards[k];
      card.style.opacity = fade.toFixed(3);
      card.style.visibility = fade < 0.01 ? 'hidden' : '';
      card.style.setProperty('--shade', clamp((0.55 - facing) / 1.4, 0, 0.8).toFixed(3));
      // Seen from behind, a card shows as a tinted glass panel, not a mirrored render.
      card.classList.toggle('is-back', facing < 0);
    }
    setActive(Math.round(pos));
  }

  const requestRender = () => {
    if (helix && live && !frame) frame = requestAnimationFrame(render);
  };

  function setActive(index) {
    if (index === active) return;
    const previous = cards[active];
    if (previous) {
      previous.classList.remove('is-active');
      link(previous).tabIndex = -1;
    }
    active = index;
    const card = cards[index];
    if (!card) return;
    card.classList.add('is-active');
    link(card).tabIndex = 0;

    capMeta.textContent = card.querySelector('.card__meta').textContent;
    capTitle.textContent = card.querySelector('.card__title').textContent;
    capDesc.textContent = card.querySelector('.card__desc').textContent;
    capOpen.href = link(card).getAttribute('href');
    caption.dataset.cat = card.dataset.cat;
    counter.textContent = `${index + 1} / ${cards.length}`;
    prevButton.disabled = index === 0;
    nextButton.disabled = index === cards.length - 1;
    if (!reduceMotion.matches) {
      caption.firstElementChild.animate(
        [{ opacity: 0.25, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 260, easing: 'cubic-bezier(.16, 1, .3, 1)' },
      );
    }
    schedulePreview(card);
  }

  // Only the front card plays its loop, and only after it has settled briefly,
  // so scrolling past a video never downloads it.
  function schedulePreview(card) {
    clearTimeout(previewTimer);
    stopPreview();
    if (!card?.dataset.preview || saveData || !live || reduceMotion.matches) return;
    previewTimer = setTimeout(() => {
      const video = document.createElement('video');
      video.muted = true;
      video.setAttribute('muted', '');
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      video.disablePictureInPicture = true;
      video.className = 'card__video';
      video.setAttribute('aria-hidden', 'true');
      video.addEventListener('playing', () => video.classList.add('is-playing'), { once: true });
      video.src = card.dataset.preview;
      link(card).append(video);
      video.play().catch(() => {});
      preview = video;
    }, 450);
  }

  function stopPreview() {
    clearTimeout(previewTimer);
    if (!preview) return;
    preview.pause();
    preview.remove();
    preview = null;
  }

  function go(index, behavior = reduceMotion.matches ? 'instant' : 'smooth') {
    if (!helix) return;
    const k = clamp(index, 0, cards.length - 1);
    scrollTo({ top: top + k * geo.stepPx, behavior });
  }

  function filter(category) {
    for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.filter === category));
    cards = all.filter((card) => category === 'all' || card.dataset.cat === category);
    for (const card of all) card.hidden = !cards.includes(card);
    const chip = chips.find((c) => c.dataset.filter === category);
    const label = chip.querySelector('.filter__label').textContent;
    const n = cards.length;
    status.textContent = category === 'all'
      ? `Showing all ${n} pieces`
      : `Showing ${n} ${label} ${n === 1 ? 'piece' : 'pieces'}`;
    if (!helix) return;
    if (active >= 0 && all[active]) all[active].classList.remove('is-active');
    for (const card of all) {
      card.classList.remove('is-active');
      link(card).tabIndex = -1;
    }
    active = -1;
    measure();
    scrollTo({ top, behavior: 'instant' });
    render();
  }

  chips.forEach((chip) => chip.addEventListener('click', () => filter(chip.dataset.filter)));
  viewButtons.forEach((button) => button.addEventListener('click', () => {
    chosenView = button.dataset.view;
    try { localStorage.setItem('work-view', chosenView); } catch {}
    if (helix === wantsHelix()) return;
    setMode();
    scrollTo({ top: section.offsetTop, behavior: 'instant' });
  }));
  prevButton.addEventListener('click', () => go(active - 1));
  nextButton.addEventListener('click', () => go(active + 1));

  // Clicking a side card brings it to the front; clicking the front card opens it.
  track.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    if (suppressClick) {
      e.preventDefault();
      suppressClick = false;
      return;
    }
    if (helix && cards.indexOf(card) !== active) {
      e.preventDefault();
      go(cards.indexOf(card));
    }
  });

  track.addEventListener('keydown', (e) => {
    if (!helix) return;
    const moves = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const k = clamp(active + moves[e.key], 0, cards.length - 1);
    go(k);
    link(cards[k]).focus({ preventScroll: true });
  });

  // Horizontal drags turn the spiral by scrolling the page, so scroll stays the
  // single source of truth for position. Vertical swipes are left to the browser.
  stage.addEventListener('pointerdown', (e) => {
    suppressClick = false;
    if (!helix || e.button !== 0 || e.target.closest('button, .filters, .work__caption')) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: scrollY, moved: false };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - drag.y)) return;
      drag.moved = true;
      stage.setPointerCapture(e.pointerId);
      root.classList.add('is-dragging');
    }
    scrollTo({ top: drag.from - (dx / (geo.size * 0.85)) * geo.stepPx, behavior: 'instant' });
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      suppressClick = true;
      root.classList.remove('is-dragging');
      go(Math.round(pos));
    }
    drag = null;
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  new IntersectionObserver(([entry]) => {
    live = entry.isIntersecting;
    section.classList.toggle('is-live', live);
    if (live) {
      requestRender();
      if (helix) schedulePreview(cards[active]);
    } else {
      stopPreview();
    }
  }, { rootMargin: '5% 0px' }).observe(section);

  addEventListener('scroll', requestRender, { passive: true });
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!helix) return;
      readTop();
      measure();
      render();
    }, 150);
  });
  addEventListener('load', () => {
    if (!helix) return;
    readTop();
    render();
  });
  reduceMotion.addEventListener('change', () => { if (!chosenView) setMode(); });
  setMode();

  return {
    list: () => cards,
    showAll: () => filter('all'),
    reveal(card) {
      const k = cards.indexOf(card);
      if (helix && k >= 0) {
        go(k, 'instant');
        render();
      } else {
        card.scrollIntoView({ block: 'center' });
      }
      link(card).focus({ preventScroll: true });
    },
  };
}

// ---------------------------------------------------------------- project viewer

// Every project has its own URL (#work/slug), so pieces can be shared directly
// and the Back button closes the viewer.
function initViewer(work) {
  const dialog = document.getElementById('viewer');
  const media = dialog.querySelector('.viewer__media');
  const tabs = dialog.querySelector('.viewer__tabs');
  const meta = dialog.querySelector('.viewer__meta');
  const title = dialog.querySelector('.viewer__title');
  const desc = dialog.querySelector('.viewer__desc');
  const count = dialog.querySelector('.viewer__count');
  const prev = dialog.querySelector('[data-go="-1"]');
  const next = dialog.querySelector('[data-go="1"]');
  let current = null;
  let entered = false;

  // Opening and closing projects moves through history; the page itself should
  // stay where the visitor left it rather than jump to a restored position.
  history.scrollRestoration = 'manual';

  const slugFromHash = () => location.hash.match(/^#work\/([a-z0-9-]+)$/)?.[1];
  const cardFor = (slug) => document.querySelector(`.card[data-slug="${slug}"]`);

  function stopVideos() {
    for (const video of media.querySelectorAll('video')) video.pause();
  }

  function showItem(item) {
    stopVideos();
    media.replaceChildren(item);
    const video = item.matches('video') ? item : null;
    if (video && !reduceMotion.matches) video.play().catch(() => {});
    else if (video) video.removeAttribute('autoplay');
  }

  function show(card) {
    current = card;
    const items = [...card.querySelector('.card__media').content.cloneNode(true).children];
    showItem(items[0]);
    tabs.replaceChildren();
    tabs.hidden = items.length < 2;
    if (items.length > 1) {
      items.forEach((item, n) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'viewer__tab';
        tab.textContent = item.dataset.label;
        tab.setAttribute('aria-pressed', String(n === 0));
        tab.addEventListener('click', () => {
          showItem(item);
          for (const t of tabs.children) t.setAttribute('aria-pressed', String(t === tab));
        });
        tabs.append(tab);
      });
    }
    meta.textContent = card.querySelector('.card__meta').textContent;
    title.textContent = card.querySelector('.card__title').textContent;
    desc.textContent = card.querySelector('.card__desc').textContent;
    dialog.dataset.cat = card.dataset.cat;
    const list = work.list();
    const i = list.indexOf(card);
    count.textContent = `${i + 1} of ${list.length}`;
    prev.disabled = i <= 0;
    next.disabled = i >= list.length - 1;
  }

  function sync() {
    const slug = slugFromHash();
    const card = slug && cardFor(slug);
    if (!card) {
      if (dialog.open) dialog.close();
      return;
    }
    if (card.hidden) work.showAll();
    show(card);
    if (!dialog.open) dialog.showModal();
  }

  function step(delta) {
    const list = work.list();
    const target = list[list.indexOf(current) + delta];
    if (target) location.replace(`#work/${target.dataset.slug}`);
  }

  addEventListener('hashchange', (e) => {
    const wasViewer = /#work\/[a-z0-9-]+$/.test(new URL(e.oldURL).hash);
    if (slugFromHash() && !wasViewer) entered = true;
    sync();
  });

  dialog.addEventListener('close', () => {
    stopVideos();
    media.replaceChildren();
    if (slugFromHash()) {
      if (entered) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
    }
    entered = false;
    const card = current;
    current = null;
    if (card) work.reveal(card);
  });

  dialog.querySelector('.viewer__close').addEventListener('click', () => dialog.close());
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  dialog.addEventListener('keydown', (e) => {
    if (e.target.closest('video')) return;
    if (e.key === 'ArrowRight' && !next.disabled) { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft' && !prev.disabled) { e.preventDefault(); step(-1); }
  });

  // Light dismiss for browsers without closedby support (Safari).
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    dialog.addEventListener('click', (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      const inside = r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
      if (!inside) dialog.close();
    });
  }

  if (slugFromHash()) sync();
}

// ---------------------------------------------------------------- contact

function initCopy() {
  const button = document.querySelector('.copy-btn');
  if (!button) return;
  if (!navigator.clipboard) {
    button.remove();
    return;
  }
  const label = button.querySelector('.copy-btn__label');
  const status = document.getElementById('copy-status');
  let timer = 0;
  button.addEventListener('click', async () => {
    clearTimeout(timer);
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      label.textContent = 'Copied';
      button.classList.add('is-done');
      status.textContent = 'Email address copied to clipboard';
    } catch {
      label.textContent = 'Copy failed';
      status.textContent = 'Could not copy. Select the email address above instead.';
    }
    timer = setTimeout(() => {
      label.textContent = 'Copy email';
      button.classList.remove('is-done');
      status.textContent = '';
    }, 2500);
  });
}
