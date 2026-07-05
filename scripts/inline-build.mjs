import fs from "node:fs";
import path from "node:path";

const distDir = path.resolve("dist");
const indexPath = path.join(distDir, "index.html");
let html = fs.readFileSync(indexPath, "utf8");

html = html.replace(
  /<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/,
  (_, file) => {
    const css = fs.readFileSync(path.join(distDir, file), "utf8");
    return `<style>\n${css}\n</style>`;
  },
);

html = html.replace(
  /<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/,
  (_, file) => {
    const js = fs.readFileSync(path.join(distDir, file), "utf8");
    return `<script type="module">\n${js}\n</script>`;
  },
);

html = html.replace(
  "</head>",
  '<link rel="icon" href="data:,">\n  </head>',
);

fs.writeFileSync(indexPath, html);
console.log("Inlined production build into dist/index.html");
