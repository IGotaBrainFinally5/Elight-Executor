
(() => {
    "use strict";

    // =========================================
    // STARTUP PREFERENCE CHECK
    // =========================================

    if (window.elight?.startupAnimationEnabled === false) {
        document.getElementById("welcome-intro")?.remove();
        return;
    }

    // =========================================
    // ELIGHT INTRO CONFIGURATION
    // =========================================

    const INTRO_DURATION = 5000;
    const ORB_DURATION = 2000;

    const ORBIT_END = 1650;
    const EXPLOSION_START = 1650;
    const EXPLOSION_DURATION = 350;

    const ROTATIONS = 2;
    const STAR_COUNT = 150;
    const TRAIL_LENGTH = 32;

    const START_ORB_SIZE = 9;
    const END_ORB_SIZE = 27;

    const intro = document.getElementById("welcome-intro");
    const canvas = document.getElementById("intro-particles");
    const content = document.querySelector(".intro-content");

    if (!intro || !canvas || !content) {
        console.error("[Elight] Intro elements could not be found.");
        return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
        console.error("[Elight] Could not initialize intro canvas.");
        return;
    }

    const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    let width = 0;
    let height = 0;
    let dpr = 1;

    let startTime = null;
    let animationFrame = null;
    let finished = false;

    let stars = [];
    let leftTrail = [];
    let rightTrail = [];
    let explosionParticles = [];

    // =========================================
    // HELPERS
    // =========================================

    const clamp = (value, min = 0, max = 1) =>
        Math.max(min, Math.min(max, value));

    const lerp = (a, b, t) =>
        a + (b - a) * t;

    const easeOut = (t) =>
        1 - Math.pow(1 - clamp(t), 3);

    const easeIn = (t) =>
        Math.pow(clamp(t), 3);

    const random = (min, max) =>
        Math.random() * (max - min) + min;

    // =========================================
    // CANVAS RESIZING
    // =========================================

    function resizeCanvas() {
        width = window.innerWidth;
        height = window.innerHeight;

        dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);

        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        createStars();
    }

    // =========================================
    // BACKGROUND STARS
    // =========================================

    function createStars() {
        stars = [];

        for (let i = 0; i < STAR_COUNT; i++) {
            stars.push({
                x: Math.random() * width,
                y: Math.random() * height,
                size: random(0.5, 1.7),
                opacity: random(0.15, 0.65),
                speed: random(0.08, 0.35),
                phase: random(0, Math.PI * 2),
                twinkleSpeed: random(0.001, 0.004)
            });
        }
    }

    function drawStars(elapsed) {
        for (const star of stars) {
            const twinkle =
                0.65 + Math.sin(
                    elapsed * star.twinkleSpeed + star.phase
                ) * 0.35;

            star.y += star.speed;

            if (star.y > height + 2) {
                star.y = -2;
                star.x = Math.random() * width;
            }

            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);

            ctx.fillStyle =
                `rgba(170, 215, 255, ${star.opacity * twinkle})`;

            ctx.fill();
        }
    }

    // =========================================
    // ORB POSITIONS
    // =========================================

    function getOrbPositions(elapsed) {
        const centerX = width / 2;
        const centerY = height / 2;

        const orbitProgress = clamp(elapsed / ORBIT_END);

        const startingRadiusX = width * 0.52 + 30;
        const startingRadiusY = Math.min(height * 0.08, 55);

        const endingRadius = Math.min(
            width * 0.27,
            height * 0.31,
            230
        );

        let radiusX = lerp(
            startingRadiusX,
            endingRadius,
            easeOut(orbitProgress)
        );

        let radiusY = lerp(
            startingRadiusY,
            endingRadius,
            easeOut(orbitProgress)
        );

        const rotationProgress =
            0.18 * orbitProgress +
            0.82 * Math.pow(orbitProgress, 2);

        let angle =
            Math.PI +
            Math.PI * 2 * ROTATIONS * rotationProgress;

        if (elapsed > ORBIT_END) {
            const collisionProgress = clamp(
                (elapsed - ORBIT_END) /
                (ORB_DURATION - ORBIT_END)
            );

            const collapse = 1 - easeIn(collisionProgress);

            radiusX *= collapse;
            radiusY *= collapse;

            angle += collisionProgress * 0.5;
        }

        const offsetX = Math.cos(angle) * radiusX;
        const offsetY = Math.sin(angle) * radiusY;

        const sizeProgress = clamp(elapsed / ORB_DURATION);

        const size = lerp(
            START_ORB_SIZE,
            END_ORB_SIZE,
            easeOut(sizeProgress)
        );

        return {
            left: {
                x: centerX + offsetX,
                y: centerY + offsetY,
                size
            },
            right: {
                x: centerX - offsetX,
                y: centerY - offsetY,
                size
            }
        };
    }

    // =========================================
    // ORB TRAILS
    // =========================================

    function updateTrail(trail, position) {
        trail.push({
            x: position.x,
            y: position.y
        });

        while (trail.length > TRAIL_LENGTH) {
            trail.shift();
        }
    }

    function drawTrail(trail) {
        if (trail.length < 2) return;

        for (let i = 1; i < trail.length; i++) {
            const previous = trail[i - 1];
            const current = trail[i];

            const progress = i / trail.length;

            ctx.beginPath();
            ctx.moveTo(previous.x, previous.y);
            ctx.lineTo(current.x, current.y);

            ctx.lineWidth = lerp(1, 6, progress);
            ctx.lineCap = "round";

            ctx.strokeStyle =
                `rgba(65, 165, 255, ${progress * 0.42})`;

            ctx.shadowColor = "#238cff";
            ctx.shadowBlur = 12 * progress;

            ctx.stroke();
        }

        ctx.shadowBlur = 0;
    }

    // =========================================
    // ORB DRAWING
    // =========================================

    function drawOrb(position) {
        const { x, y, size } = position;

        const glow = ctx.createRadialGradient(
            x, y, 0,
            x, y, size * 3.8
        );

        glow.addColorStop(0, "rgba(255,255,255,0.95)");
        glow.addColorStop(0.18, "rgba(145,215,255,0.75)");
        glow.addColorStop(0.5, "rgba(40,135,255,0.25)");
        glow.addColorStop(1, "rgba(20,100,255,0)");

        ctx.fillStyle = glow;

        ctx.beginPath();
        ctx.arc(x, y, size * 3.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = "#75caff";
        ctx.shadowBlur = 24;

        ctx.beginPath();
        ctx.arc(x, y, size * 0.48, 0, Math.PI * 2);

        ctx.fillStyle = "#ffffff";
        ctx.fill();

        ctx.shadowBlur = 0;
    }

    // =========================================
    // ENERGY WAVES
    // =========================================

    function drawEnergyWaves(elapsed, positions) {
        const pulse = (elapsed % 420) / 420;

        for (const position of [
            positions.left,
            positions.right
        ]) {
            const radius = 12 + pulse * 48;
            const opacity = (1 - pulse) * 0.24;

            ctx.beginPath();
            ctx.arc(
                position.x,
                position.y,
                radius,
                0,
                Math.PI * 2
            );

            ctx.strokeStyle =
                `rgba(100,190,255,${opacity})`;

            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }

    // =========================================
    // EXPLOSION PARTICLES
    // =========================================

    function createExplosion() {
        explosionParticles = [];

        const count = 100;

        for (let i = 0; i < count; i++) {
            const angle = random(0, Math.PI * 2);
            const speed = random(2, 11);

            explosionParticles.push({
                angle,
                speed,
                distance: random(5, 25),
                size: random(1, 3.5),
                life: random(0.55, 1),
                blue: Math.random() > 0.35
            });
        }
    }

    // =========================================
    // EXPLOSION EFFECT
    // =========================================

    function drawExplosion(elapsed) {
        const progress = clamp(
            (elapsed - EXPLOSION_START) /
            EXPLOSION_DURATION
        );

        if (progress <= 0 || progress >= 1) return;

        const centerX = width / 2;
        const centerY = height / 2;

        const flashOpacity =
            Math.pow(1 - progress, 3) * 0.9;

        const flashRadius =
            12 + easeOut(progress) * 95;

        const flash = ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, flashRadius
        );

        flash.addColorStop(
            0,
            `rgba(255,255,255,${flashOpacity})`
        );

        flash.addColorStop(
            0.3,
            `rgba(120,205,255,${flashOpacity * 0.7})`
        );

        flash.addColorStop(
            1,
            "rgba(30,120,255,0)"
        );

        ctx.fillStyle = flash;

        ctx.beginPath();
        ctx.arc(
            centerX,
            centerY,
            flashRadius,
            0,
            Math.PI * 2
        );
        ctx.fill();

        // Expanding shockwave rings.

        for (let i = 0; i < 4; i++) {
            const ringProgress = clamp(
                progress * 1.35 - i * 0.16
            );

            if (ringProgress <= 0) continue;

            const radius =
                15 + easeOut(ringProgress) * (130 + i * 35);

            const opacity =
                (1 - ringProgress) * 0.65;

            ctx.beginPath();
            ctx.arc(
                centerX,
                centerY,
                radius,
                0,
                Math.PI * 2
            );

            ctx.strokeStyle =
                `rgba(115,200,255,${opacity})`;

            ctx.lineWidth = Math.max(
                0.6,
                3 - ringProgress * 2
            );

            ctx.shadowColor = "#318fff";
            ctx.shadowBlur = 12;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Outward-moving particles.

        for (const particle of explosionParticles) {
            const distance =
                particle.distance +
                particle.speed * progress * 42;

            const x =
                centerX +
                Math.cos(particle.angle) * distance;

            const y =
                centerY +
                Math.sin(particle.angle) * distance;

            const opacity =
                (1 - progress) * particle.life;

            ctx.beginPath();
            ctx.arc(
                x,
                y,
                particle.size * (1 - progress * 0.4),
                0,
                Math.PI * 2
            );

            ctx.fillStyle = particle.blue
                ? `rgba(75,165,255,${opacity})`
                : `rgba(255,255,255,${opacity})`;

            ctx.fill();
        }
    }

    // =========================================
    // WELCOME MESSAGE
    // =========================================

    function showWelcomeMessage() {
        content.classList.add("intro-visible");
    }

    // =========================================
    // FINISH INTRO
    // =========================================

    function finishIntro() {
        if (finished) return;

        finished = true;

        if (animationFrame !== null) {
            cancelAnimationFrame(animationFrame);
        }

        intro.classList.add("intro-exit");

        window.setTimeout(() => {
            intro.remove();
        }, 260);
    }

    // =========================================
    // MAIN ANIMATION LOOP
    // =========================================

    function animate(timestamp) {
        if (finished) return;

        if (startTime === null) {
            startTime = timestamp;
        }

        const elapsed = timestamp - startTime;

        ctx.clearRect(0, 0, width, height);

        drawStars(elapsed);

        // Orb animation lasts only 2 seconds.

        if (elapsed < ORB_DURATION && !reducedMotion) {
            const positions = getOrbPositions(elapsed);

            updateTrail(leftTrail, positions.left);
            updateTrail(rightTrail, positions.right);

            drawTrail(leftTrail);
            drawTrail(rightTrail);

            drawEnergyWaves(elapsed, positions);

            drawOrb(positions.left);
            drawOrb(positions.right);

            if (elapsed >= EXPLOSION_START) {
                if (explosionParticles.length === 0) {
                    createExplosion();
                }

                drawExplosion(elapsed);
            }
        }

        // Welcome message appears after the orbs finish.

        if (elapsed >= ORB_DURATION) {
            if (!content.classList.contains("intro-visible")) {
                showWelcomeMessage();
            }
        }

        // End the entire intro at 5 seconds.

        if (elapsed >= INTRO_DURATION) {
            finishIntro();
            return;
        }

        animationFrame = requestAnimationFrame(animate);
    }

    // =========================================
    // STARTUP
    // =========================================

    resizeCanvas();

    window.addEventListener("resize", resizeCanvas);

    if (reducedMotion) {
        content.classList.add("intro-visible");

        window.setTimeout(() => {
            window.removeEventListener("resize", resizeCanvas);
            finishIntro();
        }, INTRO_DURATION);

        return;
    }

    animationFrame = requestAnimationFrame(animate);

    window.addEventListener("pagehide", () => {
        if (animationFrame !== null) {
            cancelAnimationFrame(animationFrame);
        }

        window.removeEventListener("resize", resizeCanvas);
    }, { once: true });

})();
