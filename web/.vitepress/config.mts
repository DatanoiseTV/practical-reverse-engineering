import { defineConfig } from "vitepress";
import sidebar from "./sidebar.json" with { type: "json" };

export default defineConfig({
  title:       "Practical Reverse Engineering",
  description: "A practical handbook on reverse engineering — embedded firmware (ARM Cortex-M, Xtensa/ESP32, RISC-V, 8051, MIPS), Linux userland, kernel modules and device trees, and cross-target techniques.",
  lang:        "en-US",
  srcExclude:  ["**/README.md"],
  cleanUrls:   true,
  lastUpdated: true,

  // GitHub Pages serves project sites under /<repo-name>/. The CI
  // workflow sets BASE to "/practical-reverse-engineering/"; local
  // builds default to "/" so `vitepress preview` works on
  // http://localhost:4173/ without surgery.
  base: process.env.BASE || "/",

  // VitePress resolves outDir relative to srcDir (which is web/ here),
  // so this lands at web/dist/.
  outDir: "dist",

  head: [
    ["meta", { name: "theme-color", content: "#0e3b5c" }],
    ["link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
  ],

  markdown: {
    lineNumbers:        false,
    theme: {
      light: "github-light",
      dark:  "github-dark-dimmed",
    },
    container: {
      // Custom titles for our callout boxes.
      tipLabel:     "Tip",
      warningLabel: "Warning",
      dangerLabel:  "Caution",
      infoLabel:    "Note",
      detailsLabel: "Details",
    },
  },

  themeConfig: {
    siteTitle:  "Practical Reverse Engineering",
    outline:    { level: [2, 3], label: "On this page" },
    docFooter:  { prev: "Previous", next: "Next" },

    nav: [
      { text: "Read",     link:   "/front/preface" },
      { text: "GitHub",   link:   "https://github.com/DatanoiseTV/practical-reverse-engineering" },
      { text: "Download PDF", link: "https://github.com/DatanoiseTV/practical-reverse-engineering/releases/latest" },
    ],

    sidebar,

    search: { provider: "local" },

    socialLinks: [
      { icon: "github", link: "https://github.com/DatanoiseTV/practical-reverse-engineering" },
    ],

    editLink: {
      pattern: "https://github.com/DatanoiseTV/practical-reverse-engineering/edit/main/src/:path",
      text:    "Edit this page on GitHub",
    },

    footer: {
      message:   "Released under CC BY-SA 4.0 (book text) and MIT (build scripts).",
      copyright: "Copyright © 2026 DatanoiseTV",
    },
  },
});
