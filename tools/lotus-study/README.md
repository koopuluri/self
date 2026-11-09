# Personhood / lotus video study

A square, local browser composition using the user's selected lotus footage, with vivid rose color grading and animated film grain. A small, centered row of three original SVG symbols represents personhood (heart), personal artificial intelligence (π), and personal stock ($). The first 10 seconds of the original clip repeat at original speed. Its end cuts back to its beginning; no recursive bloom or generated petals are used.

Run `npm start`, then open http://127.0.0.1:4173. Keep the server running while viewing. Source edits refresh the browser automatically. The scene uses a native muted, looping HTML video, processed through a lightweight WebGL color and grain shader in `look.js`. No Three.js or Blender runtime is needed.

Use the play button or Space, scrub the timeline, change playback speed, Color pop or Film grain, and press H to hide controls. Settings are saved locally in the browser; Reset restores 84% Color pop, 91% Film grain and original playback speed. Setting both look sliders to zero shows the source colors. Grain is regenerated per video frame and freezes when paused; it is integrated with image brightness, rather than translating a texture layer.

## Footage and crop

Source: [Blooming lotus flower — banyan21](https://www.youtube.com/watch?v=6prMmX7hqeU), selected by the user. The local 1920 × 1080 source and 1080 × 1080 cropped clip are stored in self's `<3/assets/` directory. The square crop starts at x=460, y=0, selected after examining both the opening bud and the fully opened flower. It retains all the final petals with a small surrounding margin. The stored clip retains its original colors and timing; the file contains video only. Color treatment happens live in the browser and does not modify the source.

`server.mjs` serves only the three named media files (video, poster, music excerpt) from Ghost plus this project's static files. Byte-range responses support browser seeking. The source URL and crop are also recorded in `<3/assets/lotus-bloom-source.json`.

The earlier procedural scene's source is retained in `previous-procedural/`; its vendored Three.js files remain in `vendor/`. Neither is loaded by this version.

> π: This implements the user's revised direction: the supplied lotus alone, with film grain, noise, brighter pinks, violet shadows and gentle cel-like tonal separation, plus the three symbols from the manifesto.

Export video records one complete loop at 1080 × 1080 using the same color and grain shader. The local server saves a timestamped recording in Ghost assets. The selected look is Color pop 84, Film grain 91.

`stack-icons.svg` is drawn from scratch on three shared 24-unit grids: 1.8-unit medium strokes, rounded caps and joins, consistent optical weight, a symmetrical π with mirrored legs, and warm ivory. The row is 13% of the square frame width, fixed at the center and sized to fit the opening bud. It is also composited into video exports. A reusable copy lives in `<3/assets/manifesto-stack-icons.svg`.

The lotus is lifted 2% of the frame height and shifted right approximately 0.5222% (21.6 pixels up and 5.64 pixels right at 1080, after a 3-pixel leftward refinement) to align the final bud with the stationary icon row. This translation is applied before color and grain in the shader, so preview and export have identical placement.

## Symbol reveal

The Symbols controls adjust icon weight (75–220% of the original 1.8-unit stroke) and row size (70–160% of the original 13%-wide row). The starting weight is 135%, with size kept at 100%. `stack-style.js` applies weight to the original SVG paths and uses the same SVG image for preview and video export. Both settings persist locally; adjusting weight leaves the row's size and center unchanged.

The row is invisible until 2 seconds, then rises from zero to its full ivory/white color at 10 seconds. The default cubic ease-in puts most of the change near the end: 12.5% opacity at 6 seconds, 42.2% at 8 seconds, and 100% at 10 seconds. It holds full visibility until the video restarts. Fade starts, Full white, and Acceleration controls update live and are saved with the look. `stack-motion.js` provides the same media-time curve to preview and export, so scrubbing, pausing and playback-speed changes stay synchronized.

## Music

The user originally selected 0:37–0:48 of [Announcement Music — Santhosh Narayanan](https://music.youtube.com/watch?v=nJQG0dbNscQ). The exact 11-second excerpt is stored as a stereo 48 kHz WAV in Ghost assets, with provenance in `lotus-announcement-music-source.json`. The active composition is now trimmed to 10 seconds: `lotus-bloom-square-10s.mp4` and `lotus-announcement-music-37-47.wav`. Both begin at 0 seconds and loop together. The original longer files are preserved. Icon fade controls are capped at 10 seconds, with existing in-range settings preserved. A 1.5-second quarter-sine fade-in brings it in gently; there is no added fade-out.

Click **Play with music** to unlock browser audio and restart the composition. Fade in and Volume are adjustable and saved locally. Playback, scrubbing, and looping follow the video's clock; changing playback speed also changes music speed while preserving pitch. `music.js` applies the same gain envelope to speakers and the audio track recorded by Export video. Loading the page plays the visuals silently until music is enabled.
