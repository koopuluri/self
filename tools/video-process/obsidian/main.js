const { Plugin } = require("obsidian");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs/promises");

module.exports = class GhostVideoProcess extends Plugin {
  async onload() {
    this.root = this.app.vault.adapter.getBasePath?.();
    if (!this.root || process.platform !== "darwin") return;
    this.runner = path.join(this.root, "tools/video-process/process.py");
    this.status = this.addStatusBarItem();
    this.status.setText("Ghost video · selective notes");
    this.registerMarkdownCodeBlockProcessor("ghost-video", async (source, el) => {
      const recipePath = source.trim();
      const card = el.createDiv({ cls: "ghost-video-card" });
      try {
        const absolute = this.resolve(recipePath);
        const recipe = JSON.parse(await fs.readFile(absolute, "utf8"));
        card.createEl("div", { text: recipe.title, cls: "ghost-video-title" });
        const duration = (recipe.clips.reduce((sum, clip) => sum + clip.frames, 0) + (recipe.titleCard?.frames || 0)) / recipe.canvas.fps;
        card.createEl("div", {
          text: `${duration.toFixed(2)}s · ${recipe.canvas.width} × ${recipe.canvas.height} · HDR${recipe.audio ? " · with music" : " · silent"}`,
          cls: "ghost-video-meta"
        });
        const button = card.createEl("button", { text: "▶  Open native preview", cls: "mod-cta" });
        const status = card.createEl("div", { cls: "ghost-video-meta" });
        button.addEventListener("click", () => {
          button.disabled = true;
          status.setText("Opening native player…");
          const child = this.run(["preview", recipePath]);
          let errors = "";
          child.stderr.on("data", data => { errors = (errors + data).slice(-3000); });
          child.on("error", error => { button.disabled = false; status.setText(error.message); });
          child.on("close", code => {
            button.disabled = false;
            status.setText(code ? `Preview failed: ${errors || code}` : "");
          });
          // Playback is in a real AppKit/AVPlayer window, not an iframe or a video export.
          setTimeout(() => { if (!child.killed) status.setText("Native preview opens in its own window."); }, 1500);
        });
        const details = card.createEl("details");
        details.createEl("summary", { text: "Artifact details" });
        details.createEl("code", { text: recipe.id });
        details.createEl("p", { text: recipe.parent ? `Previous artifact: ${recipe.parent}` : "First artifact" });
        const link = details.createEl("a", { text: "Open recipe", href: "#" });
        link.addEventListener("click", event => {
          event.preventDefault();
          this.app.workspace.openLinkText(recipePath, "", true);
        });
      } catch (error) {
        card.createEl("p", { text: `Cannot load this artifact: ${error.message}` });
      }
    });

  }

  resolve(relative) {
    const result = path.resolve(this.root, relative);
    if (!result.startsWith(this.root + path.sep)) throw new Error("Artifact must be inside this vault");
    return result;
  }

  run(args) {
    return spawn("/usr/bin/python3", [this.runner, ...args], { cwd: this.root, stdio: ["ignore", "pipe", "pipe"] });
  }

};
