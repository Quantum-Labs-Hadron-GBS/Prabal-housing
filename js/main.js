/**
 * PRABAL HOUSING
 * Main JavaScript File
 */

// ---------------------------------------------------------------------------
// CONTACT & LEADS CONFIG — fill these in and every CTA on the site updates.
//   phone:        e.g. '+919876543210'  (shows "Call" buttons)
//   whatsapp:     e.g. '919876543210'   (digits only, with country code; shows WhatsApp buttons)
//   leadEndpoint: a form backend URL that accepts POST (Formspree, Web3Forms,
//                 Google Apps Script, your CRM webhook...). If empty, the form
//                 falls back to WhatsApp, then to the /contact page.
// ---------------------------------------------------------------------------
const CONTACT = {
    phone: '',
    whatsapp: '',
    leadEndpoint: ''
};

// Centralized Cloudinary Config for Hero
const CLOUDINARY = {
    dayBuilding: "https://res.cloudinary.com/dyhlpxwwo/image/upload/v1789483116/ChatGPT_Image_Sep_15_2026_08_01_57_PM_u8yeqr.png",
    nightBuilding: "https://res.cloudinary.com/dyhlpxwwo/image/upload/v1789736957/ChatGPT_Image_Sep_18_2026_06_38_31_PM_ewkjq9.png"
};

// Centralized Placeholder Media Config
const MEDIA = {
    architecture: [
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80"
    ],
    residences: [
        "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80"
    ],
    amenities: [
        "https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1510784722466-f2aa9c52fff6?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1585128792020-803d29415281?auto=format&fit=crop&w=800&q=80"
    ],
    lifestyle: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1600&q=80",
    gallery: [
        "https://images.unsplash.com/photo-1600573472591-ee6b68d14c68?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1600607686527-6fb886090705?auto=format&fit=crop&w=800&q=80"
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    injectMedia();
    initDayNightToggle();
    initParallax();
    initHeroVisibility();
    initMobileMenu();
    initDynamicNavbar();
    initKeyboardNavigation();
    initGlobalParallax();
    initPartners();
    initReveal();
    initContactLinks();
    initSavingsCalculator();
    initLeadForm();
    initStickyCTAs();
    initTracking();
    initContactPagePrefill();
});

// Unsplash URLs accept a width parameter; build a srcset from it
function unsplashAt(url, w) {
    return url.replace(/([?&])w=\d+/, `$1w=${w}`);
}

// Inject placeholders from MEDIA config (lazy, sized to the slot they fill)
function injectMedia() {
    const WIDTHS = [400, 800, 1200, 1600];

    document.querySelectorAll('[data-media]').forEach(el => {
        const key = el.getAttribute('data-media');
        const index = parseInt(el.getAttribute('data-index') || "0");
        if (!MEDIA[key] || el.tagName !== 'IMG') return;

        const src = Array.isArray(MEDIA[key]) ? MEDIA[key][index] : MEDIA[key];
        if (!src) return;

        const slot = Math.ceil(el.getBoundingClientRect().width) || window.innerWidth;
        el.loading = 'lazy';
        el.decoding = 'async';
        el.sizes = `${slot}px`;
        el.srcset = WIDTHS.map(w => `${unsplashAt(src, w)} ${w}w`).join(', ');
        el.src = unsplashAt(src, 800);
    });

    // Background images: only fetch when the section is about to scroll into view
    const bgEls = document.querySelectorAll('[data-media-bg]');
    const loadBg = el => {
        const key = el.getAttribute('data-media-bg');
        const src = Array.isArray(MEDIA[key]) ? MEDIA[key][0] : MEDIA[key];
        if (!src) return;
        const w = Math.min(2400, Math.ceil(window.innerWidth * Math.min(window.devicePixelRatio || 1, 2) / 400) * 400);
        el.style.backgroundImage = `url(${unsplashAt(src, w)})`;
    };
    if (!('IntersectionObserver' in window)) return bgEls.forEach(loadBg);
    const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                loadBg(entry.target);
                io.unobserve(entry.target);
            }
        });
    }, { rootMargin: '600px 0px' });
    bgEls.forEach(el => io.observe(el));
}

// Night tower image is only downloaded when night mode is actually used.
// On desktop it is also prefetched once the page is idle so the toggle is instant.
function loadNightBuilding() {
    const img = document.getElementById('night-building-img');
    if (!img || !img.dataset.src) return;
    if (img.dataset.srcset) img.srcset = img.dataset.srcset;
    img.src = img.dataset.src;
    delete img.dataset.src;
    delete img.dataset.srcset;
}

// Day/Night Toggle System
function initDayNightToggle() {
    const btn = document.getElementById('btn-toggle-aesthetics');
    if (!btn) return;

    let isNight = localStorage.getItem('theme') === 'night';

    // Apply immediately on load
    if (isNight) {
        document.body.classList.replace('day-mode', 'night-mode');
        btn.classList.add('active');
        loadNightBuilding();
        generateStars();
    } else {
        document.body.classList.replace('night-mode', 'day-mode');
        btn.classList.remove('active');
    }

    // Prefetch night assets when the page is idle on desktop, or as soon as a
    // visitor shows intent (hover / touch) on the toggle.
    const warm = () => { loadNightBuilding(); generateStars(); };
    btn.addEventListener('pointerenter', warm, { once: true });
    btn.addEventListener('touchstart', warm, { once: true, passive: true });
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches && !navigator.connection?.saveData) {
        window.addEventListener('load', () => {
            (window.requestIdleCallback || (cb => setTimeout(cb, 2500)))(warm, { timeout: 4000 });
        });
    }

    btn.addEventListener('click', () => {
        isNight = !isNight;
        
        if (isNight) {
            loadNightBuilding();
            generateStars();
            document.body.classList.replace('day-mode', 'night-mode');
            btn.classList.add('active');
            localStorage.setItem('theme', 'night');
        } else {
            document.body.classList.replace('night-mode', 'day-mode');
            btn.classList.remove('active');
            localStorage.setItem('theme', 'day');
        }
    });
}

// Night Stars
// ~750 stars painted once onto a canvas (cheap), plus a few dozen DOM stars
// that twinkle. Previously every star was an animated element.
let starsBuilt = false;
function generateStars() {
    if (window.PrabalSky) window.PrabalSky.ensureAurora();
    const container = document.getElementById('stars-container');
    if (!container || starsBuilt) return;
    starsBuilt = true;

    // Deterministic layout so a resize repaints the same sky
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const stars = [];

    // 1. Base stars, spread everywhere
    for (let i = 0; i < 150; i++) {
        stars.push({ x: rand(), y: rand(), r: rand() * 1 + 0.5, a: 0.5 + rand() * 0.5, tint: false });
    }
    // 2. Milky Way: dense diagonal band from the top-left
    for (let i = 0; i < 400; i++) {
        const core = rand() * 0.45;
        stars.push({
            x: Math.max(0, Math.min(1, core + (rand() - 0.5) * 0.25)),
            y: Math.max(0, Math.min(1, core + (rand() - 0.5) * 0.25)),
            r: rand() * 0.6 + 0.15, a: rand() * 0.4 + 0.1, tint: rand() > 0.6
        });
    }
    // 3. Cluster above the towers (upper right)
    for (let i = 0; i < 200; i++) {
        stars.push({ x: 0.5 + rand() * 0.5, y: rand() * 0.45, r: rand() * 0.75 + 0.25, a: rand() * 0.5 + 0.1, tint: false });
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'stars-canvas';
    container.appendChild(canvas);

    const paint = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = container.clientWidth, h = container.clientHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        stars.forEach(st => {
            ctx.globalAlpha = st.a;
            ctx.fillStyle = st.tint ? '#e0e7ff' : '#ffffff';
            ctx.beginPath();
            ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
            ctx.fill();
        });
    };
    paint();

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(paint, 200);
    });

    // A handful of brighter stars that actually twinkle
    const fragment = document.createDocumentFragment();
    const twinklers = window.innerWidth <= 768 ? 24 : 48;
    for (let i = 0; i < twinklers; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        const size = rand() * 1.5 + 1;
        star.style.cssText = `left:${rand() * 100}%;top:${rand() * 70}%;width:${size}px;height:${size}px;animation-delay:${rand() * 4}s`;
        fragment.appendChild(star);
    }
    container.appendChild(fragment);
}

// Toggle a class when the hero is off screen so its animations can pause
function initHeroVisibility() {
    const hero = document.querySelector('.hero-stage');
    if (!hero || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(entries => {
        document.body.classList.toggle('hero-offscreen', !entries[0].isIntersecting);
    }).observe(hero);
}

// Hero Parallax Effect
// Layers move at different rates so the towers sink into the cloud bank
// while the sky drifts away, instead of a flat colour wiping over everything.
function initParallax() {
    const fgClouds = document.getElementById('fg-clouds');
    const skyClouds = document.getElementById('sky-clouds');
    const buildings = document.getElementById('hero-buildings');
    const heroContent = document.getElementById('hero-content');
    const scrollIndicator = document.querySelector('.scroll-indicator');
    const heroStage = document.querySelector('.hero-stage');

    if (!fgClouds || !heroStage) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let ticking = false;

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                updateParallax();
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });

    function updateParallax() {
        const scrollY = window.scrollY;
        const heroHeight = heroStage.offsetHeight;

        if (scrollY > heroHeight) return; // Stop calculating if past hero

        const progress = Math.min(scrollY / heroHeight, 1);

        // Foreground bank rises fastest, sky barely moves, towers sink slightly.
        fgClouds.style.transform = `translate3d(0, ${-progress * heroHeight * 0.35}px, 0)`;
        if (skyClouds) skyClouds.style.transform = `translate3d(0, ${progress * heroHeight * 0.25}px, 0)`;
        if (buildings) buildings.style.transform = `translate3d(0, ${progress * heroHeight * 0.18}px, 0)`;

        if (heroContent) {
            heroContent.style.opacity = Math.max(0, 1 - progress * 1.8);
            heroContent.style.setProperty('--hero-lift', `${progress * 90}px`);
        }

        if (scrollIndicator) {
            const opacity = Math.max(0, 1 - (scrollY / 200));
            scrollIndicator.style.opacity = opacity;
            scrollIndicator.style.transform = `translateY(${scrollY * 0.3}px)`;
            scrollIndicator.style.pointerEvents = opacity === 0 ? 'none' : 'auto';
        }
    }
}

// Mobile Menu System
function initMobileMenu() {
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (!menuToggle || !navLinks) return;

    const setOpen = open => {
        menuToggle.classList.toggle('active', open);
        navLinks.classList.toggle('active', open);
        document.body.classList.toggle('menu-open', open);
        menuToggle.setAttribute('aria-expanded', String(open));
        menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        // Prevent body scroll when menu is open
        document.body.style.overflow = open ? 'hidden' : '';
        if (open) {
            const navbar = document.querySelector('.navbar');
            if (navbar) navbar.style.setProperty('--nav-offset', '0px');
            setTimeout(() => navLinks.querySelector('a')?.focus({ preventScroll: true }), 350);
        }
    };

    menuToggle.addEventListener('click', () => setOpen(!navLinks.classList.contains('active')));

    // Close menu when clicking a link
    navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && navLinks.classList.contains('active')) {
            setOpen(false);
            menuToggle.focus();
        }
    });

    // Back to desktop width with the menu open: reset
    window.matchMedia('(min-width: 1025px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
}

// Dynamic Navbar System
function initDynamicNavbar() {
    const navbar = document.querySelector('.navbar');
    const allSections = document.querySelectorAll('section, .post-curtain, .footer');
    const heroSection = document.querySelector('main > section:first-child, .hero-stage');
    
    if (!navbar || allSections.length === 0) return;

    let lastScrollY = window.scrollY;

    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;
        const heroHeight = heroSection ? heroSection.offsetHeight : 300;

        // Navbar Hide/Show Logic.
        // Uses `top` rather than `transform`: a transformed navbar becomes the
        // containing block for the fixed full-screen mobile menu and squashes it.
        const menuOpen = navbar.querySelector('.nav-links.active');
        if (currentScrollY > heroHeight && !menuOpen) {
            if (currentScrollY > lastScrollY && currentScrollY > heroHeight + 50) {
                navbar.style.setProperty('--nav-offset', `-${navbar.offsetHeight + 24}px`);
            } else if (currentScrollY < lastScrollY) {
                navbar.style.setProperty('--nav-offset', '0px');
            }
        } else {
            navbar.style.setProperty('--nav-offset', '0px');
        }
        navbar.classList.toggle('is-scrolled', currentScrollY > heroHeight * 0.85);
        lastScrollY = currentScrollY;

        // Theme Toggle Logic
        const navRect = navbar.getBoundingClientRect();
        const navCenterY = navRect.top + navRect.height / 2;

        let overlappingElements = [];

        allSections.forEach(section => {
            const rect = section.getBoundingClientRect();
            if (navCenterY >= rect.top && navCenterY <= rect.bottom) {
                overlappingElements.push(section);
            }
        });

        // The last overlapping element in DOM order is visually on top
        const topElement = overlappingElements[overlappingElements.length - 1];
        const isOverDark = topElement && topElement.dataset.theme === 'dark';

        if (isOverDark) {
            navbar.classList.add('navbar-light');
        } else {
            navbar.classList.remove('navbar-light');
        }
    }, { passive: true });
    
    // Trigger once on load
    window.dispatchEvent(new Event('scroll'));
}

// Keyboard Section Navigation
function initKeyboardNavigation() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // Prevent if user is typing in a form field
            const tag = document.activeElement && document.activeElement.tagName;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || document.activeElement.isContentEditable) return;
            
            e.preventDefault();

            const sections = Array.from(document.querySelectorAll('section, .footer'));
            const currentScroll = window.scrollY;
            const viewHeight = window.innerHeight;
            
            let positions = [];
            
            sections.forEach(sec => {
                const rect = sec.getBoundingClientRect();
                const absTop = Math.round(rect.top + window.scrollY);
                positions.push(absTop);
                
                // Add virtual snap points inside tall sections so content isn't skipped
                let subPoint = absTop + viewHeight;
                while (subPoint < absTop + rect.height - (viewHeight / 3)) {
                    positions.push(subPoint);
                    subPoint += viewHeight;
                }
            });

            // Sort and remove duplicates/too-close points
            positions.sort((a, b) => a - b);
            positions = positions.filter((pos, i, arr) => i === 0 || pos - arr[i-1] > 50);

            let targetOffset = null;

            if (e.key === 'ArrowDown') {
                targetOffset = positions.find(pos => pos > currentScroll + 10);
            } else if (e.key === 'ArrowUp') {
                targetOffset = positions.slice().reverse().find(pos => pos < currentScroll - 10);
            }

            if (targetOffset !== null && targetOffset !== undefined) {
                window.scrollTo({
                    top: targetOffset,
                    behavior: 'smooth'
                });
            }
        }
    });
}

// Global Parallax Effect for standard elements
function initGlobalParallax() {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    // Elements that should receive the subtle float parallax effect
    const selectors = ['.amenity-item', '.details-box', '.footer-grid > div', '.residence-card'];
    const elements = document.querySelectorAll(selectors.join(', '));
    
    elements.forEach(el => {
        if (!el.classList.contains('residence-card')) {
            el.classList.add('parallax-item');
        }
    });

    let ticking = false;

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const windowHeight = window.innerHeight;
                
                elements.forEach((el, index) => {
                    const rect = el.getBoundingClientRect();
                    
                    // Proceed only if element is inside the viewport
                    if (rect.top < windowHeight && rect.bottom > 0) {
                        // Calculate offset relative to the center of the viewport
                        const centerOffset = (rect.top + rect.height / 2) - (windowHeight / 2);
                        // Normalize the position to roughly -1 to 1
                        const position = centerOffset / (windowHeight / 2);
                        
                        // Use a uniform speed to ensure horizontal alignment of grid elements is preserved
                        const speed = 30; 
                        
                        // Calculate parallax offset
                        const yOffset = position * speed;
                        
                        el.style.setProperty('--parallax-y', `${yOffset}px`);
                    }
                });
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

// Partners Section Scroll Animation
function initPartners() {
    const section = document.querySelector('.partners-section');
    if (!section) return;

    const cards = [
        document.getElementById('pc-0'),
        document.getElementById('pc-1'),
        document.getElementById('pc-2'),
        document.getElementById('pc-3'),
        document.getElementById('pc-4'),
        document.getElementById('pc-5')
    ];
    const centerText = document.getElementById('partners-center');
    
    // Angles to form an elliptical orbit (now 6 items):
    const config = [
        { angle: -Math.PI / 2, stackRot: -4, finalRot: -10 },       // P1 Top Center
        { angle: -Math.PI * 5 / 6, stackRot: 3, finalRot: 8 },      // P2 Top Left
        { angle: -Math.PI / 6, stackRot: -7, finalRot: -6 },        // P3 Top Right
        { angle: Math.PI * 5 / 6, stackRot: 5, finalRot: 12 },      // P4 Bottom Left
        { angle: Math.PI / 6, stackRot: -2, finalRot: -9 },         // P5 Bottom Right
        { angle: Math.PI / 2, stackRot: 4, finalRot: 6, offsetY: -15 } // P6 Bottom Center (Shifted UP to prevent cutoff)
    ];

    let ticking = false;

    // Easing function for smooth peeling
    const ease = t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    function render() {
        const rect = section.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        
        // Scroll distance available for animation
        const scrollDistance = rect.height - windowHeight;
        
        // Normalized progress (0 to 1) based on sticky element hitting top of viewport
        let rawProgress = -rect.top / scrollDistance;
        let progress = Math.max(0, Math.min(1, rawProgress));
        
        // Skip the work entirely while the section is off screen
        if (rect.bottom < -50 || rect.top > windowHeight + 50) {
            ticking = false;
            return;
        }

        const isMobile = window.innerWidth <= 768;
        // Fit the orbit to the space actually available (card size included,
        // plus ~10% for rotation) so no card is ever clipped, on any screen.
        const cardW = cards[0].offsetWidth * 0.55;
        const cardH = cards[0].offsetHeight * 0.55;
        const safeTop = isMobile ? 16 : 24;
        const safeBottom = isMobile ? 84 : 24; // clear the mobile CTA bar
        const availHalfH = (windowHeight - safeTop - safeBottom) / 2;
        const centerShift = (safeTop - safeBottom) / 2;
        const radiusX = Math.min(window.innerWidth * 0.36, window.innerWidth / 2 - cardW - 12);
        const radiusY = Math.min(windowHeight * 0.36, availHalfH - cardH);

        cards.forEach((card, i) => {
            if (!card) return;
            
            // Show cards immediately when section is visible
            card.style.opacity = 1;

            const c = config[i];
            
            // Per-card timing offset for cascading peel
            // P1 moves first, P5 moves last
            const delay = i * 0.04;
            const duration = 0.65;
            
            let cardProgress = (progress - 0.1 - delay) / duration;
            cardProgress = Math.max(0, Math.min(1, cardProgress));
            const p = ease(cardProgress);
            
            // Stacked offset (very tight visual grouping)
            const stackX = (i - 2) * 5; 
            const stackY = (i - 2) * 8; 
            
            // Radial destination offset
            const radX = Math.cos(c.angle) * radiusX;
            const radY = (Math.sin(c.angle) * radiusY) + centerShift;
            
            // Current position via interpolation
            const currentX = stackX + (radX - stackX) * p;
            const currentY = stackY + (radY - stackY) * p;
            
            // Current rotation via interpolation
            const currentRot = c.stackRot + (c.finalRot - c.stackRot) * p;
            
            // Current scale & depth
            // Cards overlap slightly scaled down initially, then expand to full size
            const startScale = 0.9 + (i * 0.02);
            const currentScale = startScale + (1 - startScale) * p;
            
            // Apply z-index to create stack hierarchy
            card.style.zIndex = 10 + i;
            
            card.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) rotate(${currentRot}deg) scale(${currentScale})`;
        });

        if (centerText) {
            // Reveal center text incrementally as cards spread apart
            let textOp = (progress - 0.2) / 0.4;
            textOp = Math.max(0, Math.min(1, textOp));
            
            let textScale = 0.95 + (0.05 * textOp);
            
            centerText.style.opacity = textOp;
            centerText.style.transform = `scale(${textScale})`;
        }
        
        ticking = false;
    }

    // Initial render call
    render();

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(render);
            ticking = true;
        }
    }, { passive: true });
    
    window.addEventListener('resize', () => {
        if (!ticking) {
            window.requestAnimationFrame(render);
            ticking = true;
        }
    });
}


// ---------------------------------------------------------------------------
// Conversion features
// ---------------------------------------------------------------------------

// Fade sections up as they enter the viewport
function initReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
        items.forEach(el => el.classList.add('is-visible'));
        return;
    }

    const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                io.unobserve(entry.target);
            }
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    items.forEach(el => io.observe(el));
}

function whatsappURL(message) {
    return `https://wa.me/${CONTACT.whatsapp}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

// Wire up Call / WhatsApp buttons; hide them until a number is configured
function initContactLinks() {
    document.querySelectorAll('[data-contact]').forEach(el => {
        const type = el.dataset.contact;
        if (type === 'phone' && CONTACT.phone) {
            el.href = `tel:${CONTACT.phone}`;
            el.hidden = false;
        } else if (type === 'whatsapp' && CONTACT.whatsapp) {
            el.href = whatsappURL("Hi PRABALHOUSING, I'm looking for a home in Pune.");
            el.target = '_blank';
            el.rel = 'noopener';
            el.hidden = false;
        }
    });

    document.querySelectorAll('[data-contact-direct]').forEach(el => {
        el.hidden = !(CONTACT.phone || CONTACT.whatsapp);
    });
}

function formatINR(lakhs) {
    if (lakhs >= 100) {
        const cr = lakhs / 100;
        return `₹${cr.toFixed(cr >= 10 ? 1 : 2).replace(/\.?0+$/, '')} Cr`;
    }
    return `₹${lakhs.toFixed(lakhs >= 10 ? 1 : 2).replace(/\.?0+$/, '')} L`;
}

function budgetBucket(lakhs) {
    if (lakhs < 75) return 'Under 75 L';
    if (lakhs <= 150) return '75 L - 1.5 Cr';
    if (lakhs <= 300) return '1.5 - 3 Cr';
    return '3 Cr+';
}

// Brokerage savings calculator
function initSavingsCalculator() {
    const range = document.getElementById('budget-range');
    if (!range) return;

    const out = document.getElementById('budget-output');
    const fee = document.getElementById('broker-fee');
    const total = document.getElementById('savings-total');
    const GST = 1.18;

    const update = () => {
        const lakhs = Number(range.value);
        const low = lakhs * 0.01 * GST;
        const high = lakhs * 0.02 * GST;
        out.textContent = formatINR(lakhs);
        fee.textContent = `${formatINR(low)} – ${formatINR(high)}`;
        total.textContent = formatINR(high);
        const pct = ((lakhs - range.min) / (range.max - range.min)) * 100;
        range.style.setProperty('--fill', `${pct}%`);
    };

    range.addEventListener('input', update);
    update();

    // Carry the chosen budget into the lead form
    const cta = document.querySelector('.savings-cta');
    if (cta) {
        cta.addEventListener('click', () => {
            prefillLead({ budget: budgetBucket(Number(range.value)) });
        });
    }
}

function prefillLead({ bhk, budget, area } = {}) {
    const form = document.getElementById('lead-form');
    if (!form) return;
    if (bhk) form.querySelector('#lead-bhk').value = bhk;
    if (budget) form.querySelector('#lead-budget').value = budget;
    if (area) {
        form.querySelector('#lead-area').value = area;
        const note = document.getElementById('lead-area-note');
        if (note) {
            note.textContent = area === 'Not sure yet'
                ? "No problem — we'll help you pick the right area."
                : `Looking in ${area} — noted.`;
            note.hidden = false;
        }
    }
    form.classList.remove('form-flash');
    void form.offsetWidth;
    form.classList.add('form-flash');

    // Put the cursor in the first field once the smooth scroll lands
    const name = form.querySelector('#lead-name');
    if (name && !name.value) setTimeout(() => name.focus({ preventScroll: true }), 700);
}

// Inline lead form
function initLeadForm() {
    const form = document.getElementById('lead-form');
    if (!form) return;

    // Any CTA that carries context pre-fills the form (delegated, so listing
    // cards rendered later from the dashboard data work too)
    document.addEventListener('click', e => {
        const link = e.target.closest('a[href="#get-shortlist"]');
        if (link) prefillLead({ bhk: link.dataset.bhk, area: link.dataset.area });
    });

    const nameInput = form.querySelector('#lead-name');
    const phoneInput = form.querySelector('#lead-phone');
    const errorEl = document.getElementById('lead-error');
    const submitBtn = form.querySelector('.lead-submit');

    phoneInput.addEventListener('input', () => {
        phoneInput.value = phoneInput.value.replace(/\D/g, '').replace(/^91(?=\d{10})/, '').slice(0, 10);
        phoneInput.removeAttribute('aria-invalid');
    });
    nameInput.addEventListener('input', () => nameInput.removeAttribute('aria-invalid'));

    const showError = msg => {
        errorEl.textContent = msg;
        errorEl.hidden = !msg;
    };

    form.addEventListener('submit', async e => {
        e.preventDefault();
        showError('');

        const data = Object.fromEntries(new FormData(form).entries());
        data.name = (data.name || '').trim();

        if (data.name.length < 2) {
            nameInput.setAttribute('aria-invalid', 'true');
            nameInput.focus();
            return showError('Please tell us your name.');
        }
        if (!/^[6-9]\d{9}$/.test(data.phone || '')) {
            phoneInput.setAttribute('aria-invalid', 'true');
            phoneInput.focus();
            return showError('Please enter a valid 10-digit mobile number.');
        }

        data.source = 'homepage_shortlist';
        data.page = window.location.href;

        const bhkLabel = form.querySelector('#lead-bhk').selectedOptions[0]?.textContent || '';
        const summary = [
            `Hi PRABALHOUSING, I'm ${data.name} (+91 ${data.phone}).`,
            `I'd like a free shortlist.`,
            data.bhk ? `Looking for: ${bhkLabel}.` : '',
            data.budget ? `Budget: ₹${data.budget}.` : '',
            data.area ? `Area: ${data.area}.` : ''
        ].filter(Boolean).join(' ');

        submitBtn.disabled = true;
        submitBtn.textContent = 'SENDING...';

        try {
            if (CONTACT.leadEndpoint) {
                const res = await fetch(CONTACT.leadEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ ...data, message: summary })
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
            } else if (CONTACT.whatsapp) {
                window.open(whatsappURL(summary), '_blank', 'noopener');
            } else {
                // No backend configured yet: hand over to the contact page, pre-filled.
                const params = new URLSearchParams({
                    name: data.name, phone: data.phone, bhk: data.bhk || '', message: summary
                });
                track('lead_submit', { method: 'contact_page' });
                window.location.href = `/contact?${params.toString()}`;
                return;
            }

            track('lead_submit', { method: CONTACT.leadEndpoint ? 'endpoint' : 'whatsapp' });
            form.querySelector('.lead-form-body').hidden = true;
            document.getElementById('lead-success-name').textContent = `, ${data.name.split(' ')[0]}`;
            document.getElementById('lead-success').hidden = false;
        } catch (err) {
            showError(CONTACT.whatsapp || CONTACT.phone
                ? 'Something went wrong. Please try again, or reach us directly on WhatsApp / call.'
                : 'Something went wrong. Please try again in a moment.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'GET MY FREE SHORTLIST';
        }
    });
}

// Floating "talk to an advisor" pill (desktop) + bottom action bar (mobile).
// They appear once the visitor has scrolled past the hero and get out of the
// way when the lead form itself is on screen.
function initStickyCTAs() {
    const pill = document.getElementById('float-cta');
    const bar = document.getElementById('mobile-cta-bar');
    const hero = document.querySelector('.hero-stage');
    const formSection = document.getElementById('get-shortlist');
    if ((!pill && !bar) || !hero) return;

    let formVisible = false;
    if (formSection && 'IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
            formVisible = entries[0].isIntersecting;
            update();
        }, { threshold: 0.15 }).observe(formSection);
    }

    function update() {
        const pastHero = window.scrollY > hero.offsetHeight * 0.7;
        const show = pastHero && !formVisible;
        if (pill) pill.classList.toggle('is-visible', show);
        if (bar) bar.classList.toggle('is-visible', show);
    }

    window.addEventListener('scroll', update, { passive: true });
    update();
}

// Vercel Analytics custom events (no-op if analytics isn't loaded)
function track(name, data) {
    try {
        if (window.va) window.va('event', { name, data });
    } catch (err) { /* ignore */ }
}

function initTracking() {
    document.addEventListener('click', e => {
        const el = e.target.closest('[data-track]');
        if (!el || el.dataset.track === 'lead_submit') return; // lead_submit is tracked on success
        track('cta_click', { id: el.dataset.track });
    });

    // How far do people get? Fire once per section.
    const sections = document.querySelectorAll('main section[id]');
    if (!sections.length || !('IntersectionObserver' in window)) return;
    const seen = new Set();
    const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const id = entry.target.id;
            if (entry.isIntersecting && !seen.has(id)) {
                seen.add(id);
                track('section_view', { id });
                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.4 });
    sections.forEach(s => io.observe(s));
}

// /contact?name=..&phone=..&bhk=..&message=.. -> pre-fill the contact form
function initContactPagePrefill() {
    const form = document.querySelector('.contact-form-wrapper form');
    if (!form || !window.location.search) return;
    const params = new URLSearchParams(window.location.search);
    const set = (sel, val) => {
        const el = form.querySelector(sel);
        if (el && val) el.value = val;
    };
    set('#fullName', params.get('name'));
    set('#mobileNumber', params.get('phone'));
    set('#bhkSelect', params.get('bhk'));
    set('#message', params.get('message'));
}
