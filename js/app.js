/* ===== ХинкБери — App Logic ===== */

function getPagePath() {
  try {
    return decodeURIComponent(window.location.pathname);
  } catch (e) {
    return window.location.pathname;
  }
}

// ===== AUTOMATIC DISPLAY / ZOOM SYNC =====
// Automatically ensures menu renders at the exact same scale as index
(function() {
  function syncDisplayZoom() {
    const rawPath = getPagePath().toLowerCase();
    const isMenu = rawPath.endsWith('menu.html') || rawPath.includes('меню') || rawPath.endsWith('/menu') || rawPath === '/menu';
    if (!isMenu) {
      try {
        localStorage.setItem('hb_master_dpr', String(window.devicePixelRatio || 1));
      } catch (e) {}
    } else {
      try {
        const masterDpr = parseFloat(localStorage.getItem('hb_master_dpr') || '0');
        const currentDpr = window.devicePixelRatio || 1;
        if (masterDpr && Math.abs(currentDpr - masterDpr) > 0.04) {
          const ratio = masterDpr / currentDpr;
          document.documentElement.style.zoom = ratio;
        } else if (!masterDpr && currentDpr < 0.95) {
          document.documentElement.style.zoom = 1 / currentDpr;
        }
      } catch (e) {}
    }
  }
  syncDisplayZoom();
  window.addEventListener('resize', syncDisplayZoom);
})();

// ===== URL NORMALIZER & LOCALIZATION =====
// Displays clean Russian URLs (/Главная and /Меню) in the address bar
(function updateAddressBar() {
  try {
    const rawPath = getPagePath();
    const lower = rawPath.toLowerCase();
    const isMenu = lower.endsWith('menu.html') || lower.includes('меню') || lower.endsWith('/menu') || lower === '/menu';
    if (isMenu) {
      if (rawPath !== '/Меню') {
        window.history.replaceState(null, '', '/Меню' + window.location.search + window.location.hash);
      }
    } else {
      if (rawPath.endsWith('index.html') || rawPath === '' || rawPath === '/' || lower === '/главная' || lower.endsWith('/главная')) {
        if (rawPath !== '/Главная') {
          window.history.replaceState(null, '', '/Главная' + window.location.search + window.location.hash);
        }
      }
    }
  } catch (e) {}
})();

// ===== AUTH SYSTEM (localStorage) =====
const AUTH_KEY = 'hinkberry_users';
const SESSION_KEY = 'hinkberry_session';

function getUsers() {
  try {
    const stored = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored)
      .filter(([, user]) => user && typeof user === 'object' && !Array.isArray(user))
      .map(([email, user]) => [email, {
        ...user,
        name: typeof user.name === 'string' && user.name.trim() ? user.name : 'Гость',
        points: Number.isFinite(user.points) && user.points >= 0 ? user.points : 0,
        history: Array.isArray(user.history) ? user.history.filter(item =>
          item && typeof item === 'object' && typeof item.desc === 'string' &&
          Number.isFinite(item.points) && (item.date == null || typeof item.date === 'string')
        ) : []
      }]));
  } catch (e) {
    return {};
  }
}
function saveUsers(users) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(users));
  } catch (e) {}
}
function getSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!session || typeof session !== 'object' || Array.isArray(session) ||
        typeof session.email !== 'string' || !session.email.trim()) return null;
    return {
      email: session.email.trim().toLowerCase(),
      name: typeof session.name === 'string' && session.name.trim() ? session.name : 'Гость'
    };
  } catch (e) {
    return null;
  }
}
function setSession(user) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch (e) {}
}
function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

const AUTH_UNAVAILABLE_MESSAGE = 'Личный кабинет временно недоступен. Попробуйте позже.';

async function requestAuth(endpoint, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!(response.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
      throw new Error('Expected a JSON response');
    }
    const data = await response.json();
    if (!response.ok) {
      if ([400, 401, 409, 422].includes(response.status) && data &&
          data.ok === false && typeof data.error === 'string' && data.error.trim()) {
        return { ok: false, error: data.error };
      }
      throw new Error('Authentication API is unavailable');
    }
    const user = data && data.user;
    if (!data || data.ok !== true || !user || typeof user !== 'object' || Array.isArray(user) ||
        typeof user.name !== 'string' || !user.name.trim() ||
        !Number.isFinite(user.points) || user.points < 0 || !Array.isArray(user.history) ||
        !user.history.every(item => item && typeof item === 'object' &&
          typeof item.desc === 'string' && Number.isFinite(item.points) &&
          (item.date == null || typeof item.date === 'string'))) {
      throw new Error('Invalid authentication response');
    }
    // Cache display data only. Passwords and server-only fields never enter localStorage.
    return {
      ok: true,
      user: {
        email: payload.email,
        name: user.name,
        points: user.points,
        history: user.history.map(item => ({ desc: item.desc, points: item.points, date: item.date || '' }))
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function cacheAuthenticatedUser(email, user) {
  const users = getUsers();
  users[email] = user;
  saveUsers(users);
  setSession({ email, name: user.name });
}

// ===== TOAST =====
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

// ===== PASSWORD TOGGLE =====
function togglePassword(id, btn) {
  const inp = document.getElementById(id);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.style.opacity = '1';
  } else {
    inp.type = 'password';
    btn.style.opacity = '0.5';
  }
}

// ===== MODAL SYSTEM =====
function openModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) {
    m.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// ===== MOBILE NAV HELPER =====
function closeMobileNav() {
  const nav = document.getElementById('nav');
  const burgerBtn = document.getElementById('burgerBtn');
  if (nav && nav.classList.contains('active')) {
    nav.classList.remove('active');
    if (burgerBtn) burgerBtn.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// ===== LOGOUT HELPER =====
function handleLogout() {
  clearSession();
  closeModal('profileModal');
  closeMobileNav();
  updateAuthUI();
  showToast('Вы вышли из аккаунта');
}

// ===== UPDATE AUTH UI =====
function updateAuthUI() {
  const session = getSession();
  const users = getUsers();
  const user = session && Object.prototype.hasOwnProperty.call(users, session.email)
    ? users[session.email] : null;
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const loyaltyPill = document.getElementById('loyaltyPill');
  const loyaltyPillText = document.getElementById('loyaltyPillText');
  const loyaltyRegBtn = document.getElementById('loyaltyRegBtn');

  // Mobile nav action elements
  const mobileGuestActions = document.getElementById('mobileGuestActions');
  const mobileUserActions = document.getElementById('mobileUserActions');
  const mobilePointsText = document.getElementById('mobilePointsText');

  // Loyalty banner elements
  const bannerPointsNum = document.getElementById('bannerPointsNum') || document.querySelector('.loyalty-card__points-num');
  const bannerPointsLabel = document.getElementById('bannerPointsLabel') || document.querySelector('.loyalty-card__points-label');
  const bannerCardName = document.getElementById('bannerCardName') || document.querySelector('.loyalty-card__name');

  if (user) {
    const pts = user.points;

    // Desktop Header
    if (loyaltyPill) {
      loyaltyPill.style.display = 'inline-flex';
      loyaltyPill.onclick = () => openProfileModal();
    }
    if (loyaltyPillText) loyaltyPillText.textContent = pts + ' Б';

    if (loginBtn) {
      loginBtn.textContent = 'Личный кабинет';
      loginBtn.onclick = () => openProfileModal();
    }
    if (registerBtn) {
      registerBtn.style.display = 'none';
    }

    // Mobile Nav Drawer
    if (mobileGuestActions) mobileGuestActions.style.display = 'none';
    if (mobileUserActions) mobileUserActions.style.display = 'block';
    if (mobilePointsText) mobilePointsText.textContent = pts + ' Б';

    // Loyalty Banner
    if (loyaltyRegBtn) {
      loyaltyRegBtn.textContent = 'Мой кабинет (' + pts + ' Б)';
      loyaltyRegBtn.onclick = () => openProfileModal();
    }
    if (bannerPointsNum) bannerPointsNum.textContent = pts;
    if (bannerCardName) bannerCardName.textContent = user.name || 'Гость';

  } else {
    // Guest (not logged in)

    // Desktop Header
    if (loyaltyPill) {
      loyaltyPill.style.display = 'none';
    }
    if (loginBtn) {
      loginBtn.textContent = 'Войти';
      loginBtn.onclick = () => { switchTab('login'); openModal('authModal'); };
    }
    if (registerBtn) {
      registerBtn.style.display = '';
      registerBtn.onclick = () => { switchTab('register'); openModal('authModal'); };
    }

    // Mobile Nav Drawer
    if (mobileGuestActions) mobileGuestActions.style.display = 'block';
    if (mobileUserActions) mobileUserActions.style.display = 'none';

    // Loyalty Banner
    if (loyaltyRegBtn) {
      loyaltyRegBtn.textContent = 'Зарегистрироваться (+100 Б)';
      loyaltyRegBtn.onclick = () => { switchTab('register'); openModal('authModal'); };
    }
    if (bannerPointsNum) bannerPointsNum.textContent = '0';
    if (bannerCardName) bannerCardName.textContent = 'Тут будет ваше имя';
  }
}

// ===== PROFILE MODAL =====
function openProfileModal() {
  const session = getSession();
  if (!session) return;
  const users = getUsers();
  const user = Object.prototype.hasOwnProperty.call(users, session.email) ? users[session.email] : null;
  if (!user) return;

  const avatar = document.getElementById('profileAvatar');
  const name = document.getElementById('profileName');
  const email = document.getElementById('profileEmail');
  const points = document.getElementById('profilePoints');
  const barFill = document.getElementById('pointsBarFill');
  const toNext = document.getElementById('pointsToNext');
  const histEmpty = document.getElementById('historyEmpty');
  const histList = document.getElementById('historyList');

  const displayName = user.name || session.name || 'Гость';
  if (avatar) avatar.textContent = displayName[0].toUpperCase();
  if (name) name.textContent = displayName;
  if (email) email.textContent = user.email || session.email || '';

  const pts = user.points;
  if (points) points.textContent = pts;

  // Level progress (out of 200)
  const percent = Math.min(100, Math.round((pts / 200) * 100));
  if (barFill) barFill.style.width = percent + '%';
  if (toNext) toNext.textContent = Math.max(0, 200 - pts);

  if (histList) {
    histList.innerHTML = '';
    const history = user.history;

    if (histEmpty) histEmpty.style.display = history.length ? 'none' : '';

    history.forEach(h => {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.875rem;';
      const details = document.createElement('div');
      const description = document.createElement('div');
      description.style.cssText = 'font-weight:500;color:var(--white);';
      description.textContent = h.desc;
      const date = document.createElement('div');
      date.style.cssText = 'font-size:0.75rem;color:var(--gray);margin-top:2px;';
      date.textContent = h.date || '';
      details.appendChild(description);
      details.appendChild(date);
      const amount = document.createElement('span');
      amount.style.cssText = 'color:var(--gold);font-weight:700;font-size:0.95rem;';
      amount.textContent = (h.points > 0 ? '+' : '') + h.points + ' б.';
      li.appendChild(details);
      li.appendChild(amount);
      histList.appendChild(li);
    });
  }

  openModal('profileModal');
}

// ===== TAB SWITCHING =====
function switchTab(tab) {
  document.querySelectorAll('.modal__tab').forEach(t => {
    t.classList.toggle('modal__tab--active', t.dataset.tab === tab);
  });
  const login = document.getElementById('loginForm');
  const reg = document.getElementById('registerForm');
  if (login) login.classList.toggle('auth-form--hidden', tab !== 'login');
  if (reg) reg.classList.toggle('auth-form--hidden', tab !== 'register');
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {

  // Auth & profile modals
  const authModal = document.getElementById('authModal');
  const profileModal = document.getElementById('profileModal');
  const modalClose = document.getElementById('modalClose');
  const profileClose = document.getElementById('profileClose');
  const logoutBtn = document.getElementById('logoutBtn');

  // Mobile nav buttons
  const mobileLoginBtn = document.getElementById('mobileLoginBtn');
  const mobileRegisterBtn = document.getElementById('mobileRegisterBtn');
  const mobileProfileBtn = document.getElementById('mobileProfileBtn');
  const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');

  // Tab clicks
  document.querySelectorAll('.modal__tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Switch links
  document.querySelectorAll('[data-switch]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(link.dataset.switch);
    });
  });

  // Close modals
  if (modalClose) modalClose.addEventListener('click', () => closeModal('authModal'));
  if (profileClose) profileClose.addEventListener('click', () => closeModal('profileModal'));
  if (authModal) authModal.addEventListener('click', (e) => { if (e.target === authModal) closeModal('authModal'); });
  if (profileModal) profileModal.addEventListener('click', (e) => { if (e.target === profileModal) closeModal('profileModal'); });

  // ESC to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal('authModal');
      closeModal('profileModal');
      closeMobileNav();
    }
  });

  // Desktop Logout
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  // Mobile Nav Action Clicks
  if (mobileLoginBtn) {
    mobileLoginBtn.addEventListener('click', () => {
      closeMobileNav();
      switchTab('login');
      openModal('authModal');
    });
  }
  if (mobileRegisterBtn) {
    mobileRegisterBtn.addEventListener('click', () => {
      closeMobileNav();
      switchTab('register');
      openModal('authModal');
    });
  }
  if (mobileProfileBtn) {
    mobileProfileBtn.addEventListener('click', () => {
      closeMobileNav();
      openProfileModal();
    });
  }
  if (mobileLogoutBtn) {
    mobileLogoutBtn.addEventListener('click', handleLogout);
  }

  // LOGIN FORM
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('loginEmail') || loginForm.querySelector('input[type="email"]');
      const passInput = document.getElementById('loginPassword');
      const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
      const pass = passInput ? passInput.value : '';

      if (!email || !pass) {
        showToast('Заполните email и пароль');
        return;
      }

      const submitButton = loginForm.querySelector('button[type="submit"]');
      if (submitButton && submitButton.disabled) return;
      if (submitButton) submitButton.disabled = true;
      try {
        const data = await requestAuth('/api/login', { email, password: pass });
        if (data.ok) {
          const user = data.user;
          cacheAuthenticatedUser(email, user);
          closeModal('authModal');
          updateAuthUI();
          showToast('Добро пожаловать, ' + user.name + '!');
          loginForm.reset();
        } else {
          showToast(data.error);
        }
      } catch (err) {
        showToast(AUTH_UNAVAILABLE_MESSAGE);
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  // REGISTER FORM
  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('regName');
      const emailInput = document.getElementById('regEmail');
      const passInput = document.getElementById('regPassword');
      const name = nameInput ? nameInput.value.trim() : '';
      const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
      const pass = passInput ? passInput.value : '';

      if (!name || !email || !pass) {
        showToast('Заполните все поля');
        return;
      }
      if (pass.length < 6) {
        showToast('Пароль минимум 6 символов');
        return;
      }

      const submitButton = registerForm.querySelector('button[type="submit"]');
      if (submitButton && submitButton.disabled) return;
      if (submitButton) submitButton.disabled = true;
      try {
        const data = await requestAuth('/api/register', { name, email, password: pass });
        if (data.ok) {
          const user = data.user;
          cacheAuthenticatedUser(email, user);
          closeModal('authModal');
          updateAuthUI();
          showToast('Добро пожаловать, ' + user.name + '!');
          registerForm.reset();
        } else {
          showToast(data.error);
        }
      } catch (err) {
        showToast(AUTH_UNAVAILABLE_MESSAGE);
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  // BURGER MENU (Mobile)
  const burgerBtn = document.getElementById('burgerBtn');
  const nav = document.getElementById('nav');

  if (burgerBtn && nav) {
    burgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = nav.classList.toggle('active');
      burgerBtn.classList.toggle('active', isOpen);
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // Close when clicking any nav link
    nav.querySelectorAll('.nav__link').forEach(link => {
      link.addEventListener('click', closeMobileNav);
    });

    // Close when clicking outside nav
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('active') && !nav.contains(e.target) && e.target !== burgerBtn && !burgerBtn.contains(e.target)) {
        closeMobileNav();
      }
    });
  }

  // MENU TABS (menu page)
  document.querySelectorAll('.menu-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('menu-tab--active'));
      tab.classList.add('menu-tab--active');
      document.querySelectorAll('.menu-cat').forEach(c => c.classList.add('menu-cat--hidden'));
      const target = document.getElementById('cat-' + tab.dataset.cat);
      if (target) target.classList.remove('menu-cat--hidden');
    });
  });

  // Header scroll effect
  const header = document.getElementById('header');
  if (header) {
    window.addEventListener('scroll', () => {
      header.style.background = window.scrollY > 50
        ? 'rgba(255, 255, 255, 0.98)'
        : 'rgba(255, 255, 255, 0.88)';
    });
  }

  // Restore authenticated state on load
  updateAuthUI();

  // Active nav link highlight on scroll
  const sections = document.querySelectorAll('section[id], header[id]');
  const navLinks = document.querySelectorAll('.nav .nav__link');

  window.addEventListener('scroll', () => {
    let current = '';
    const scrollPos = window.scrollY + 120;
    sections.forEach(sec => {
      const top = sec.offsetTop;
      const height = sec.offsetHeight;
      if (scrollPos >= top && scrollPos < top + height) {
        current = sec.getAttribute('id');
      }
    });

    if (current) {
      navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === '#' + current || (current === 'hero' && (href === '#hero' || href === 'index.html' || href === '/Главная' || href === '/'))) {
          link.classList.add('nav__link--active');
        } else if (href.startsWith('#')) {
          link.classList.remove('nav__link--active');
        }
      });
    }
  }, { passive: true });

  // ===== TOUCH AND CLICK LIFT EFFECT FOR MOBILE =====
  function initTouchLiftEffects() {
    const targets = document.querySelectorAll('.loyalty-card, .contacts__map, .dish-card, .menu-item, #loginBtn, #mobileLoginBtn, .btn--gold, .btn--maps, .stat-card, .review-card');
    targets.forEach(el => {
      el.addEventListener('touchstart', function() {
        el.classList.add('is-touched');
      }, { passive: true });

      el.addEventListener('touchend', function() {
        setTimeout(() => {
          el.classList.remove('is-touched');
        }, 350);
      }, { passive: true });

      el.addEventListener('touchcancel', function() {
        el.classList.remove('is-touched');
      }, { passive: true });
    });
  }
  initTouchLiftEffects();

  // ===== SMOOTH SEAMLESS PAGE TRANSITIONS (SPA FEEL) =====
  function initPageTransitions() {
    const pageWrapper = document.getElementById('pageWrapper');
    if (!pageWrapper) return;

    function readTransition(key) {
      try { return sessionStorage.getItem(key); } catch (e) { return null; }
    }
    function writeTransition(key, value) {
      try { sessionStorage.setItem(key, value); } catch (e) {}
    }
    function removeTransition(key) {
      try { sessionStorage.removeItem(key); } catch (e) {}
    }

    let navigationTimer;
    let recoveryTimer;
    function restorePage() {
      clearTimeout(navigationTimer);
      clearTimeout(recoveryTimer);
      pageWrapper.classList.remove('anim-slide-out-left', 'anim-slide-out-right',
        'anim-slide-in-left', 'anim-slide-in-right', 'anim-fade-out', 'anim-fade-in');
    }
    function navigate(destination, animationClass) {
      restorePage();
      pageWrapper.classList.add(animationClass);
      // A canceled or stalled navigation must not leave the current page invisible.
      recoveryTimer = setTimeout(restorePage, 3000);
      navigationTimer = setTimeout(() => {
        try {
          window.location.href = destination;
        } catch (e) {
          restorePage();
          showToast('Не удалось открыть страницу. Попробуйте ещё раз.');
        }
      }, 200);
    }
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        restorePage();
        removeTransition('hb_transition');
        removeTransition('hb_scroll_target');
      }
    });

    // Check if we arrived via a transition
    const trans = readTransition('hb_transition');
    if (trans === 'to_menu') {
      removeTransition('hb_transition');
      pageWrapper.classList.add('anim-slide-in-right');
    } else if (trans === 'to_home') {
      removeTransition('hb_transition');
      pageWrapper.classList.add('anim-slide-in-left');
    } else if (trans === 'scroll_target') {
      removeTransition('hb_transition');
      pageWrapper.classList.add('anim-fade-in');
    }

    const scrollTarget = readTransition('hb_scroll_target');
    if (scrollTarget) {
      removeTransition('hb_scroll_target');
      setTimeout(() => {
        const el = document.getElementById(scrollTarget);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 120);
    }

    // Intercept clicks on links for seamless slide transitions
    document.querySelectorAll('a').forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('tel:') || href.startsWith('mailto:') || link.target === '_blank') {
        return;
      }

      link.addEventListener('click', (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.which === 2) return;

        const currentPath = getPagePath().toLowerCase();
        const isCurrentMenu = currentPath.endsWith('menu.html') || currentPath.includes('меню') || currentPath.endsWith('/menu') || currentPath === '/menu';

        // Case 1: Clicking anchor on current page (e.g. #reviews on index.html)
        if (href.startsWith('#')) {
          e.preventDefault();
          closeMobileNav();
          const targetId = href.replace('#', '');
          if (!targetId || targetId === 'hero') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            const el = document.getElementById(targetId);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }
          return;
        }

        // Case 2: On menu page clicking anchor to index (e.g. /Главная#reviews, index.html#reviews, index.html#contacts)
        if (isCurrentMenu && (href.includes('#reviews') || href.includes('#contacts') || href.includes('#about'))) {
          e.preventDefault();
          closeMobileNav();
          const targetId = href.split('#')[1];
          writeTransition('hb_transition', 'scroll_target');
          writeTransition('hb_scroll_target', targetId);
          navigate('/Главная#' + targetId, 'anim-slide-out-right');
          return;
        }

        // Case 3: On menu page clicking back to Home (/Главная, index.html or index.html#hero)
        if (isCurrentMenu && (href === 'index.html' || href === 'index.html#hero' || href === '/Главная' || href === '/Главная#hero' || href === '#hero' || href === '/')) {
          e.preventDefault();
          closeMobileNav();
          writeTransition('hb_transition', 'to_home');
          navigate('/Главная', 'anim-slide-out-right');
          return;
        }

        // Case 4: On home page clicking to Menu (/Меню, menu.html)
        if (!isCurrentMenu && (href.includes('menu.html') || href.includes('Меню') || href.includes('меню') || href === '/menu')) {
          e.preventDefault();
          closeMobileNav();
          writeTransition('hb_transition', 'to_menu');
          navigate('/Меню', 'anim-slide-out-left');
          return;
        }
      });
    });
  }
  initPageTransitions();
});
