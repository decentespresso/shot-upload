const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readSource = (file) => fs.readFileSync(path.join(root, "src", file), "utf8").replace(/\r\n/g, "\n");
const outputPath = path.join(root, "shot-upload.reaplugin", "plugin.js");
const output = `const SHOT_UPLOAD_UI = ${JSON.stringify(readSource("ui.html"))};\n\n${readSource("plugin.js")}`;

if (process.argv.includes("--check")) {
  if (fs.readFileSync(outputPath, "utf8").replace(/\r\n/g, "\n") !== output) {
    throw new Error("Plugin artifact is out of date. Run node scripts/build.js.");
  }
} else {
  fs.writeFileSync(outputPath, output);
}
