// Transcodes the original renders in MEDIA/ into web-ready video.
//
// For every clip it writes:
//   assets/video/<slug>.mp4          full piece for the project viewer (with audio)
//   assets/video/<slug>-preview.mp4  small muted loop for the helix card
//   .work/posters/<slug>.png         poster frame, turned into AVIF/WebP by optimize-images.mjs
//
// Usage:  node tools/encode-videos.mjs
// Needs ffmpeg on PATH, or FFMPEG=C:\path\to\ffmpeg.exe in the environment.

import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA = join(root, 'MEDIA');
const OUT = join(root, 'assets', 'video');
const POSTERS = join(root, '.work', 'posters');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

// size: square output edge; width: 16:9 output width.
// preview.crossfade blends the excerpt's tail into its head so a cut from the
// middle of a long piece still loops without a visible jump.
const clips = [
  {
    src: 'MotionLoop_Pendulum_2021.mp4', slug: 'pendulum', size: 1024, fps: 30, crf: 27,
    preview: { start: 34, duration: 8, crossfade: 1 }, poster: 36,
  },
  {
    src: 'Hard_Surface_Modeling_ioi_award_design_yr_1_Turntable_2023.mp4', slug: 'ioi-award-1', size: 1080, fps: 30, crf: 23,
    preview: { start: 0, duration: 3.3 }, poster: 1,
  },
  {
    src: 'Hard_Surface_Modeling_ioi_award_design_yr_5_Turntable_2023.mp4', slug: 'ioi-award-5', size: 1080, fps: 30, crf: 23,
    preview: { start: 0, duration: 3.3 }, poster: 1,
  },
  {
    src: 'Hard_Surface_Modeling_ioi_award_design_10_Turntable_2023.mp4', slug: 'ioi-award-10', size: 1080, fps: 30, crf: 23,
    preview: { start: 0, duration: 3.3 }, poster: 1,
  },
  {
    src: 'Hard_Surface_Modeling_ioi_award_design_yr_15_Turntable_2023.mp4', slug: 'ioi-award-15', size: 1080, fps: 30, crf: 23,
    preview: { start: 0, duration: 3.3 }, poster: 1,
  },
  {
    src: 'Hard_Surface_Modeling_ioi_award_design_20_Turntable_2023.mp4', slug: 'ioi-award-20', size: 1080, fps: 30, crf: 23,
    preview: { start: 0, duration: 3.3 }, poster: 1,
  },
  {
    src: 'Hard_Surface_Modeling_MK1_Promotional_Medalion_WB_2023.mp4', slug: 'mk1-medallion', size: 1080, fps: 30, crf: 23,
    preview: { start: 0, duration: 3.3 }, poster: 1.5,
  },
  {
    src: 'Product_Placement_Advert_Terra_SodaCan_Turntable_2025.mp4', slug: 'terra-turntable', size: 1080, fps: 30, crf: 23,
    preview: { start: 0, duration: 3.3 }, poster: 1,
  },
  {
    src: 'Product_Placement_Advert_Z&Z_SodaCan_Turntable_2025.mp4', slug: 'zest-zing-turntable', size: 1080, fps: 30, crf: 23,
    preview: { start: 0, duration: 3.3 }, poster: 1,
  },
  {
    src: 'Product_Placement_Advert_Aurevia_Turntable_Face_Cream_Tube_2026.mp4', slug: 'aurevia-turntable', size: 1080, fps: 30, crf: 23,
    preview: { start: 0, duration: 3.3 }, poster: 0.2,
  },
  {
    src: 'Hard_Surface_Modeling_VFB_Stuttgart_Champions_League_Roblox_UGC_Clothing_2024.mp4', slug: 'vfb-stuttgart-roblox-ugc', size: 1080, fps: 30, crf: 23,
    preview: { start: 0, duration: 3.3 }, poster: 0.3,
  },
];

const H264 = ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];

function scaleFilter(clip, preview) {
  if (clip.size) {
    const edge = preview ? 540 : clip.size;
    return `scale=${edge}:${edge}:flags=lanczos`;
  }
  const w = preview ? 640 : clip.width;
  return `scale=${w}:-2:flags=lanczos`;
}

function ffmpeg(args) {
  const run = spawnSync(FFMPEG, ['-hide_banner', '-v', 'error', '-y', ...args], { stdio: 'inherit' });
  if (run.status !== 0) throw new Error(`ffmpeg failed (${run.status}): ${args.join(' ')}`);
}

function mb(file) {
  return (statSync(file).size / 1024 / 1024).toFixed(2) + ' MB';
}

mkdirSync(OUT, { recursive: true });
mkdirSync(POSTERS, { recursive: true });

for (const clip of clips) {
  const input = join(MEDIA, clip.src);
  const full = join(OUT, `${clip.slug}.mp4`);
  const preview = join(OUT, `${clip.slug}-preview.mp4`);
  const poster = join(POSTERS, `${clip.slug}.png`);

  ffmpeg([
    '-i', input, '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', `${scaleFilter(clip, false)},fps=${clip.fps}`,
    ...H264, '-crf', String(clip.crf),
    '-c:a', 'aac', '-b:a', '128k', full,
  ]);

  const { start, duration, crossfade } = clip.preview;
  const scale = `${scaleFilter(clip, true)},fps=${clip.fps}`;
  const filter = crossfade
    ? `[0:v]trim=start=${start}:duration=${duration + crossfade},setpts=PTS-STARTPTS,${scale},split[a][b];` +
      `[a]trim=start=${crossfade},setpts=PTS-STARTPTS[body];` +
      `[b]trim=duration=${crossfade},setpts=PTS-STARTPTS[head];` +
      `[body][head]xfade=transition=fade:duration=${crossfade}:offset=${duration - crossfade}[v]`
    : `[0:v]trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS,${scale}[v]`;
  ffmpeg(['-i', input, '-filter_complex', filter, '-map', '[v]', '-an', ...H264, '-crf', '30', preview]);

  ffmpeg(['-ss', String(clip.poster), '-i', input, '-frames:v', '1', '-vf', scaleFilter(clip, false), poster]);

  console.log(`${clip.slug}: full ${mb(full)}, preview ${mb(preview)}`);
}
