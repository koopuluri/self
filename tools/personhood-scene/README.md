# Personhood scene

Blender source for the manifesto's first five-second loop. Generated scenes and previews live in `../../<3/assets/`. `Open Personhood.command` now opens **v3**; v1 and v2 remain intact.

`build_organic_scene.py` creates v3. The paper matches the sampled outer border of `Screenshot 2026-11-02 at 2.14.23 PM.png`: RGB 244, 237, 213 (#F4EDD5). The broad moving cloud wash is removed. Pigment and contours evolve locally using 4D noise with fixed spatial coordinates; the complete figure breathes and sways with its feet nearly still. One density field covers the connected anatomy, with a longer neck and gently sloping shoulders. There are no internal shading rings around the component forms.

V3's **Pigment motion** slider controls local texture evolution. **Motion** controls the body's sway; **Paper motion** controls only fine changes in the paper tooth. Set each to zero to isolate the remaining motion. **Dispersion**, **Grain**, **Ink**, **Paper warmth** and **Figure size** remain available. Paper warmth=1 matches the reference, and zero is neutral gray.

Build the current scene with `blender --background --python build_organic_scene.py`. Render it with `blender --background '../../<3/assets/personhood-v3.blend' --python render_dream_loop.py`. The renderer names its frame directory and validation report after the loaded scene, so earlier revisions remain untouched.

> π: V3 incorporates the user's three corrections: warmer outer-paper color, local material evolution without the rigid circling wash, and a continuous human silhouette without visible divisions at the joints. The 4:3 camera and five-second loop are retained.

`build_dream_scene.py` creates v2: an editable procedural drawing of a faceless person in soft graphite on warm paper. Native shader nodes animate the shape, grain and atmosphere. Named empty objects in **Editable figure forms** control the underlying anatomy; move and scale them to redraw the figure. This is a camera-facing 2.5D drawing, not a character built for rotating around in 3D.

The v2 controls are Motion, Flow, Dispersion, Grain, Ink, Atmosphere, Paper warmth and Figure size. Zero Paper warmth gives neutral gray. `manifesto_format.json` establishes **1280 × 960, 4:3, 24 fps, five seconds** as the common format for all three manifesto compositions. Future builders should read this file.

Build v2 with `blender --background --python build_dream_scene.py`. Render with `blender --background '../../<3/assets/personhood-v2.blend' --python render_dream_loop.py`. The renderer checks all animated shader values and writes frames to `/private/tmp/ghost-personhood-frames-v2`, including a separate frame 121 for checking the seam. Export only frames 1–120.

> π: V2 responds to the user's “my visual taste” references: notebook paper, grain within the drawing, an abstract person, dissolving edges, and much stronger continuous motion. The pale flowing washes belong to the page; the ideas/aura treatment is reserved for the second scene. V1 is retained for comparison.

`build_scene.py` creates the editable geometry, grayscale materials, cyclic motion, camera and controls. `controls.py` adds the small Personhood sidebar when Blender is launched with that script. All essential controls are also ordinary custom properties on the `CONTROLS` object, so the scene remains editable without running the sidebar script.

The scene runs at 24 fps, frames 1–120. Frame 121 is mathematically identical to frame 1 and is excluded from exports. Motion uses Blender's built-in driver expressions, with no external frame handlers.

For a fresh Blender session, double-click `Open Personhood.command`. This opens the scene and its small sidebar. Press the sidebar's **Play / Pause** button or Space while the pointer is over the view. Press N to hide or show the controls. The controls affect the current scene; save a copy if you want to preserve your own settings between generated revisions.

`render_loop.py` verifies the cyclic geometry and drivers, then renders the 120 frames into `/private/tmp/ghost-personhood-frames-v1`. The exported MP4 is `'../../<3/assets/personhood-v1.mp4'`.

Rebuild:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python build_scene.py
```

Open with controls:

```sh
/Applications/Blender.app/Contents/MacOS/Blender '../../<3/assets/personhood-v1.blend' --python controls.py
```

> π: This is the first editable style and motion study: an abstract, front-facing person, restrained grayscale cel shading, a fixed camera, and slight motion in the body, fabric, hair, atmosphere and surface texture. Its shapes and motion are intended to be iterated together.
