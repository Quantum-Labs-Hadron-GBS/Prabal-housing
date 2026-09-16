/**
 * PRABAL HOUSING
 * Main JavaScript File
 */

// Centralized Cloudinary Config for Hero
const CLOUDINARY = {
    dayBuilding: "https://res.cloudinary.com/dyhlpxwwo/image/upload/v1789483116/ChatGPT_Image_Sep_15_2026_08_01_57_PM_u8yeqr.png",
    nightBuilding: "https://res.cloudinary.com/dyhlpxwwo/image/upload/v1789483116/ChatGPT_Image_Sep_15_2026_08_03_17_PM_gogd1u.png"
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
