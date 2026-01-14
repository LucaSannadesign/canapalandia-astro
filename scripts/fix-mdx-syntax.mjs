import fs from "node:fs/promises";
import path from "node:path";
import { readdir } from "node:fs/promises";

const BLOG_DIR = path.join(process.cwd(), "src", "content", "blog");

/**
 * Fix MDX syntax issues in blog posts
 */
async function fixMdxFile(filePath) {
  let content = await fs.readFile(filePath, "utf8");
  let changed = false;

  // 1) Fix self-closing tags: <br/>, <hr/>, <img.../> → <br />, <hr />, <img ... />
  const selfClosingTags = ["br", "hr", "img", "meta", "link", "input", "area", "base", "col", "embed", "source", "track", "wbr"];
  for (const tag of selfClosingTags) {
    // Pattern: <tag.../> → <tag... />
    const regex = new RegExp(`<${tag}([^>]*)\\/>`, "gi");
    const newContent = content.replace(regex, `<${tag}$1 />`);
    if (newContent !== content) {
      content = newContent;
      changed = true;
    }
  }

  // 2) Fix <br> without slash → <br />
  content = content.replace(/<br>/gi, "<br />");
  if (content !== await fs.readFile(filePath, "utf8")) changed = true;

  // 3) Remove orphan closing tags at start of body (after frontmatter)
  // Pattern: ---\n</p> or ---\n</div> etc at start of body
  content = content.replace(/^---\n[\s\S]*?---\n<\/p>\n/gm, (match) => {
    return match.replace(/<\/p>\n$/, "\n");
  });
  if (content !== await fs.readFile(filePath, "utf8")) changed = true;

  // 4) Fix duplicate closing tags: </p></p> → </p>
  content = content.replace(/<\/p><\/p>/g, "</p>");
  if (content !== await fs.readFile(filePath, "utf8")) changed = true;

  // 5) Fix <p> on one line, content on next, </p> on same line as content
  // Pattern: <p>\nText</p> → <p>Text</p>
  content = content.replace(/<p>\n([^<\n]+)<\/p>/g, "<p>$1</p>");
  if (content !== await fs.readFile(filePath, "utf8")) changed = true;

  // 6) Remove empty <p></p> tags
  content = content.replace(/<p>\s*<\/p>/g, "");
  if (content !== await fs.readFile(filePath, "utf8")) changed = true;

  if (changed) {
    await fs.writeFile(filePath, content, "utf8");
    return true;
  }
  return false;
}

async function main() {
  const blogDir = path.join(process.cwd(), "src", "content", "blog");
  const entries = await readdir(blogDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(".mdx"))
    .map((e) => path.join(blogDir, e.name));
  let fixed = 0;

  console.log(`[fix-mdx] Processing ${files.length} files...`);

  for (const file of files) {
    try {
      const wasFixed = await fixMdxFile(file);
      if (wasFixed) {
        fixed++;
        console.log(`[fix-mdx] Fixed: ${path.basename(file)}`);
      }
    } catch (err) {
      console.error(`[fix-mdx] Error in ${file}:`, err.message);
    }
  }

  console.log(`[fix-mdx] ✓ Fixed ${fixed} files`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
