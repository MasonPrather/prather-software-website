/** A GIF is optional: the HTML always starts with the static fallback. */
document
  .querySelectorAll<HTMLElement>('[data-hero-backdrop]')
  .forEach((backdrop) => {
    const image = backdrop.querySelector<HTMLImageElement>('[data-hero-image]');
    const toggle = backdrop.querySelector<HTMLButtonElement>(
      '.hero-motion-toggle',
    );
    const poster = backdrop.dataset.staticSrc;
    const animation = backdrop.dataset.motionSrc;
    if (!image || !toggle || !poster || !animation) return;

    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let paused = false;
    let failed = false;

    const update = () => {
      const playing = !preference.matches && !paused && !failed;
      const source = playing ? animation : poster;
      if (image.getAttribute('src') !== source) image.src = source;
      backdrop.dataset.motionState = playing ? 'playing' : 'paused';
      toggle.hidden = preference.matches || failed;
      toggle.textContent = playing
        ? 'Pause background animation'
        : 'Play background animation';
    };

    toggle.addEventListener('click', () => {
      paused = !paused;
      update();
    });
    preference.addEventListener('change', update);
    image.addEventListener('error', () => {
      if (image.getAttribute('src') === animation) {
        failed = true;
        update();
      }
    });
    update();
  });
