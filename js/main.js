/**
 * PRABAL HOUSING
 * Main JavaScript File
 */

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
    initHeroImages();
    injectMedia();
    initDayNightToggle();
    generateStars();
    initParallax();
    initMobileMenu();
    initDynamicNavbar();
    initKeyboardNavigation();
});

// Load hero assets
function initHeroImages() {
    const dayImg = document.getElementById('day-building-img');
    const nightImg = document.getElementById('night-building-img');
    
    if (dayImg) dayImg.src = CLOUDINARY.dayBuilding;
    if (nightImg) nightImg.src = CLOUDINARY.nightBuilding;

    // Cloud video speed
    const cloudVideo = document.querySelector('.hero-cloud-video');
    if (cloudVideo) {
        cloudVideo.playbackRate = 1.0;
    }
}

// Inject placeholders from MEDIA config
function injectMedia() {
    // Standard images
    document.querySelectorAll('[data-media]').forEach(el => {
        const key = el.getAttribute('data-media');
        const index = parseInt(el.getAttribute('data-index') || "0");
        
        if (MEDIA[key]) {
            const src = Array.isArray(MEDIA[key]) ? MEDIA[key][index] : MEDIA[key];
            if (src && el.tagName === 'IMG') {
                el.src = src;
            }
        }
    });

    // Background images
    document.querySelectorAll('[data-media-bg]').forEach(el => {
        const key = el.getAttribute('data-media-bg');
        if (MEDIA[key]) {
            const src = Array.isArray(MEDIA[key]) ? MEDIA[key][0] : MEDIA[key];
            if (src) {
                el.style.backgroundImage = `url(${src})`;
            }
        }
    });
}

// Day/Night Toggle System
function initDayNightToggle() {
    const btn = document.getElementById('btn-toggle-aesthetics');
    if (!btn) return;

    let isNight = false;

    btn.addEventListener('click', () => {
        isNight = !isNight;
        
        if (isNight) {
            document.body.classList.replace('day-mode', 'night-mode');
            btn.textContent = 'EXPLORE DAY';
        } else {
            document.body.classList.replace('night-mode', 'day-mode');
            btn.textContent = 'EXPLORE NIGHT';
        }
    });
}

// Generate Night Stars
function generateStars() {
    const container = document.getElementById('stars-container');
    if (!container) return;

    const numStars = 150;
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < numStars; i++) {
        const star = document.createElement('div');
        star.classList.add('star');
        
        // Random positioning
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        
        // Random size (tiny)
        const size = Math.random() * 2 + 1;
        
        // Random animation delay
        const delay = Math.random() * 4;

        star.style.left = `${x}%`;
        star.style.top = `${y}%`;
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.animationDelay = `${delay}s`;

        fragment.appendChild(star);
    }

    container.appendChild(fragment);
}

// Hero Parallax Effect
function initParallax() {
    const fgClouds = document.getElementById('fg-clouds');
    if (!fgClouds) return;

    const heroStage = document.querySelector('.hero-stage');
    
    // Limits the max distance foreground clouds can travel
    const MAX_CLOUD_TRAVEL = 600; 

    // Respect reduced motion
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

        // Calculate progress (0 to 1)
        const progress = Math.min(scrollY / heroHeight, 1);
        
        // Calculate offset
        const cloudOffset = progress * MAX_CLOUD_TRAVEL;

        // Apply transform via translate3d for hardware acceleration
        fgClouds.style.transform = `translate3d(0, ${-cloudOffset}px, 0)`;
    }
}

// Mobile Menu System
function initMobileMenu() {
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (!menuToggle || !navLinks) return;

    menuToggle.addEventListener('click', () => {
        menuToggle.classList.toggle('active');
        navLinks.classList.toggle('active');
        // Prevent body scroll when menu is open
        document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
    });
    
    // Close menu when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            menuToggle.classList.remove('active');
            navLinks.classList.remove('active');
            document.body.style.overflow = '';
        });
    });
}

// Dynamic Navbar System
function initDynamicNavbar() {
    const navbar = document.querySelector('.navbar');
    const allSections = document.querySelectorAll('section, .post-curtain, .footer');
    
    if (!navbar || allSections.length === 0) return;

    window.addEventListener('scroll', () => {
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
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
            
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
