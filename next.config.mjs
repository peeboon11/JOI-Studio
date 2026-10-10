/** @type {import('next').NextConfig} */
export default {
  // lets a check build use a separate folder without clobbering a running `next dev`
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
