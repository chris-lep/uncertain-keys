const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const pkgPath = path.join(rootDir, "package.json");
const citationPath = path.join(rootDir, "CITATION.cff");
const indexPath = path.join(rootDir, "index.html");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const version = pkg.version;

if (!version) {
  throw new Error("package.json version is missing");
}

if (!fs.existsSync(citationPath)) {
  throw new Error("CITATION.cff not found");
}

const citation = fs.readFileSync(citationPath, "utf8");
const nextCitation = citation.match(/^version:\s*/m)
  ? citation.replace(/^version:\s*.*$/m, `version: ${version}`)
  : `${citation.trimEnd()}\nversion: ${version}\n`;

if (nextCitation !== citation) {
  fs.writeFileSync(citationPath, nextCitation);
}

if (fs.existsSync(indexPath)) {
  const indexHtml = fs.readFileSync(indexPath, "utf8");
  const nextIndex = indexHtml.replace(
    /(<strong>Version:<\/strong>\s*)([^<]+)/,
    `$1${version}`
  );
  if (nextIndex !== indexHtml) {
    fs.writeFileSync(indexPath, nextIndex);
  }
}
