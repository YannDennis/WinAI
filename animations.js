// ============================================================
//  WinAI · animations.js
//  Animations globales du site
// ============================================================

(function () {

  // ── 1. REVEAL AU SCROLL (amélioré) ───────────────────────
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => {
          e.target.classList.add('visible');
        }, i * 80);
        revealObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  // ── 2. NAV — glassmorphism au scroll ─────────────────────
  const nav = document.querySelector('nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 60) {
        nav.style.background = 'rgba(8,8,8,.98)';
        nav.style.borderBottomColor = 'rgba(255,255,255,.07)';
        nav.style.boxShadow = '0 4px 30px rgba(0,0,0,.4)';
      } else {
        nav.style.background = 'rgba(8,8,8,.92)';
        nav.style.borderBottomColor = 'rgba(255,255,255,.04)';
        nav.style.boxShadow = 'none';
      }
    }, { passive: true });
  }

  // ── 3. CARTES MATCHS — apparition en cascade ─────────────
  function animateMatchCards() {
    const cards = document.querySelectorAll('.match-card, .wf-card');
    const cardObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const siblings = [...e.target.parentElement.children];
          const idx = siblings.indexOf(e.target);
          setTimeout(() => {
            e.target.style.opacity = '1';
            e.target.style.transform = 'translateY(0)';
          }, idx * 60);
          cardObserver.unobserve(e.target);
        }
      });
    }, { threshold: 0.05 });

    cards.forEach(card => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(16px)';
      card.style.transition = 'opacity .4s ease, transform .4s ease';
      cardObserver.observe(card);
    });
  }

  const matchGridObserver = new MutationObserver(() => {
    animateMatchCards();
  });
  const matchGrid = document.getElementById('allMatchesGrid');
  if (matchGrid) {
    matchGridObserver.observe(matchGrid, { childList: true, subtree: true });
  }

  // ── 4. COMPTEURS HERO ─────────────────────────────────────
  function animateCounter(el, target, duration = 1200) {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        el.textContent = target + '+';
        clearInterval(timer);
      } else {
        el.textContent = Math.floor(start) + '+';
      }
    }, 16);
  }

  const heroStats = document.querySelectorAll('.hero-left [style*="font-size:22px"]');
  if (heroStats.length) {
    const statObserver = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const text = e.target.textContent.trim();
          const num = parseInt(text.replace('+', ''));
          if (!isNaN(num) && num > 1) animateCounter(e.target, num);
          statObserver.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });
    heroStats.forEach(s => statObserver.observe(s));
  }

  // ── 5. RIPPLE EFFECT sur les boutons ─────────────────────
  function addRipple(e) {
    const btn = e.currentTarget;
    const ripple = document.createElement('span');
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;

    ripple.style.cssText = `
      position:absolute;width:${size}px;height:${size}px;
      left:${x}px;top:${y}px;
      background:rgba(255,255,255,.15);border-radius:50%;
      transform:scale(0);animation:rippleAnim .5s ease-out forwards;
      pointer-events:none;
    `;

    if (!btn.style.position || btn.style.position === 'static') {
      btn.style.position = 'relative';
    }
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  if (!document.getElementById('rippleStyle')) {
    const style = document.createElement('style');
    style.id = 'rippleStyle';
    style.textContent = `
      @keyframes rippleAnim { to { transform: scale(2.5); opacity: 0; } }
      .match-card { transition: background .2s, transform .2s, box-shadow .2s !important; }
      .match-card:hover { transform: translateY(-2px) !important; box-shadow: 0 8px 24px rgba(0,0,0,.4) !important; }
      .wf-card { transition: background .2s, transform .2s, box-shadow .2s !important; }
      .wf-card:hover { transform: translateY(-2px) !important; box-shadow: 0 8px 24px rgba(0,0,0,.4) !important; }
      .btn-red, .nav-cta, .gen-btn, .price-btn { transition: all .2s !important; }
      .btn-red:active, .nav-cta:active, .gen-btn:active { transform: scale(.97) !important; }
      .price-card { transition: transform .25s ease, box-shadow .25s ease !important; }
      .price-card:hover { transform: translateY(-4px) !important; box-shadow: 0 20px 40px rgba(0,0,0,.5) !important; }
      .step { transition: transform .25s ease, background .2s !important; }
      .step:hover { transform: translateY(-3px) !important; }
    `;
    document.head.appendChild(style);
  }

  document.querySelectorAll('.btn-red, .nav-cta, .gen-btn, .price-btn, .btn-white').forEach(btn => {
    btn.addEventListener('click', addRipple);
  });

  // ── 6. RÉSULTAT PRONOSTIC — animation des sections ───────
  const resultObserver = new MutationObserver(() => {
    const box = document.getElementById('pronoResultBox');
    if (box) {
      const children = box.querySelectorAll(':scope > div');
      children.forEach((child, i) => {
        if (!child.dataset.animated) {
          child.dataset.animated = '1';
          child.style.opacity = '0';
          child.style.transform = 'translateY(10px)';
          child.style.transition = `opacity .35s ease ${i * 80}ms, transform .35s ease ${i * 80}ms`;
          requestAnimationFrame(() => {
            child.style.opacity = '1';
            child.style.transform = 'translateY(0)';
          });
        }
      });
    }
  });

  const panel2 = document.getElementById('panel2');
  if (panel2) {
    resultObserver.observe(panel2, { childList: true, subtree: true });
  }

  // ── 7. SMOOTH SCROLL ─────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ── 8. ACTIVE NAV LINK au scroll ─────────────────────────
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(s => {
      if (window.scrollY >= s.offsetTop - 100) current = s.id;
    });
    navLinks.forEach(link => {
      link.style.color = link.getAttribute('href') === '#' + current ? 'var(--white)' : '';
    });
  }, { passive: true });

})();
