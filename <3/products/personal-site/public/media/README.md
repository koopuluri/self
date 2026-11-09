# public essay media

Files here are deliberately public and deploy with the site. Original media
remains in Ghost's private assets archive.

`personal-stack.mp4` is the web copy of `assets/personal-manifesto.mp4`, copied
unchanged into that archive from the Desktop source. It retains the original
1080×1080 dimensions, ten-second duration and audio. From the Ghost root:

```sh
ffmpeg -i assets/personal-manifesto.mp4 -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart <3/products/personal-site/public/media/personal-stack.mp4
```

Embed it in an essay with:

```md
[The Personal Stack](/media/personal-stack.mp4 "video")
```
