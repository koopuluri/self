# social preview font

`Inter-Medium.ttf` is a static instance of Google Fonts' Inter, at weight 500 and
optical size 14, matching the site's Inter text. It is loaded locally by the social
image renderer so generating previews does not require a font service.

Source: [Inter variable font](https://github.com/google/fonts/blob/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf),
downloaded November 5, 2026. Original SHA-256:
`29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031`.
Instantiated using fontTools' `instantiateVariableFont` with `wght=500, opsz=14`.
The font is distributed under the accompanying [SIL Open Font License](OFL.txt).

The variable Inter and Geist Mono WOFF2 subsets are retained byte-for-byte from the existing Next.js font cache. app/workspace-fonts.css preserves their unicode ranges, weights and fallback metrics so local builds need no Google Fonts connection.

Geist Mono uses the accompanying [SIL Open Font License](Geist-OFL.txt), from the [Google Fonts distribution](https://github.com/google/fonts/tree/main/ofl/geistmono).
