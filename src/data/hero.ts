/**
 * Paths are relative to public/. Keep image static for reduced-motion and
 * no-JavaScript visitors. The original artwork is decorative, not a product
 * screenshot. To use a GIF later, put it in public/images, set animatedImage
 * to its root-relative path, and keep a corresponding still frame in image.
 */
export const heroMedia = {
  image: '/images/hero-brand-static.svg',
  animatedImage: '/images/hero-brand-animated.svg' as string | undefined,
};
