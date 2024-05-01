import fs from 'fs';
import path from 'path';
import { Font, FontEditor, woff2 } from 'fonteditor-core';
import NodeFetchCache, { FileSystemCache } from 'node-fetch-cache';

const cache: any = NodeFetchCache;
const fetch = cache.create({
  cache: new FileSystemCache(),
});

type IconClassifier = string;
type Icon = IconClassifier[];

interface FileIconExtractor {
  /**
   * Array of extensions to match.
   */
  exts: string[]

  /**
   * Extract icons from a string.
   */
  extract(contents: string): Icon[]
  
  // // TODO: improve this with async?
  // extractFromFile(file: string): string[] {
  //   const content = fs.readFileSync(file, 'utf8').toString();
  //   return this.extract(content);
  // }
}

class HtmlIconExtractor implements FileIconExtractor {
  exts = ['html']
  extract(contents: string): Icon[] {
    const iconRegex = /fa([srb]?|-solid|-regular|-brands) fa-[a-z\-]+/g;
    return contents.match(iconRegex)?.forEach(icon => icon.split(' ')) ?? [];
  }
}

class JsIconExtractor implements FileIconExtractor {
  exts = ['js']
  extract(contents: string): Icon[] {
    const iconRegex = /(fa([srb]?|-solid|-regular|-brands) )?fa-[a-z\-]+/g;
    return contents.match(iconRegex)?.forEach(icon => icon.split(' ')) ?? [];
  }
}

class SystemExtractor {
  extractors: FileIconExtractor[] = [new HtmlIconExtractor, new JsIconExtractor]
  fileMap: { [ext: string]: string[] } = {}

  /**
   * Crawl files in a directory, extracting icons from relevant files.
   * @param directory The folder to crawl.
   */
  crawlAndExtract(directory: string): Icon[] {
    const files = fs.readdirSync(directory, { recursive: true });
    const matches: Icon[] = [];

    for (const f_ of files) {
      const file = path.join(directory, f_.toString());
      const ext = file.split('.').pop();

      if (!ext) // No extension.
        continue;

      for (const extr of this.extractors) {
        if (extr.exts.includes(ext)) {
          if (!this.fileMap[ext])
            this.fileMap[ext] = [];

          this.fileMap[ext].push(file);

          // Extract icons from file.
          const contents = fs.readFileSync(file, 'utf8').toString();
          const icons = extr.extract(contents);
          matches.push(...icons);
          break;
        }
      }
    }

    return matches;
  }
}



class WebFontMinifier {
  static extractURLsFromCSS(css: string): string[] {
    return [];
  }


  async minimiseFontFile(buffer: Buffer, type: FontEditor.FontType, subset: number[]): Promise<Buffer> {
    if (type === 'woff2' && !woff2.isInited) {
      await woff2.init();
    }
  
    const font = Font.create(buffer, {
      type,
      subset,
    });
    font.optimize();
  
    const buff = font.write({
      toBuffer: true,
      type,
    });
    return buff;
  }

}



// function extractIcons(file: string): string[] {
//   const iconRegex = /(fa([srb]?|-solid|-regular|-brands) )?fa-[a-z\-]+/g;
//   // TODO: improve this with async.
//   const content = fs.readFileSync(file, 'utf8').toString();
//   const matches = content.match(iconRegex) ?? [];
//   return matches;
// }

// <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
/**
 * @param file HTML file to search for a known CSS webfont.
 * @returns Path to the CSS webfont (may be an URI).
 */
function findWebFont(file: string): string | undefined {
  const content = fs.readFileSync(file, 'utf8').toString();
  // Search for font-awesome link.
  const match = content.match(/(?<=")https?:\/\/[^"]*font-awesome[^"]*.css(?=")/);
  return match?.[0];
}


async function minify(directory: string) {

  const extractor = new SystemExtractor;
  const icons = extractor.crawlAndExtract(directory);

  console.log(`found ${icons.length} matches`);

  const matchesSet = new Set(icons);
  console.log(`found ${matchesSet.size} unique matches`);
  console.log(matchesSet);

  const htmlFile = extractor.fileMap['html'][0];
  const cssFile = findWebFont(htmlFile);
  console.log('css file:', cssFile);

  if (cssFile === undefined) {
    throw new Error(`could not find font file from ${htmlFile}`)
  }

  const response = await fetch(cssFile, {});
  if (!response.ok) {
    throw new Error(`Bad response for ${cssFile} (${response.status}): ${response.statusText}`);
  }

  const css: string = await response.text();
  // console.log(css);

  const urlMatches: string[] | null = css.match(/url\(.*?\)/g);
  if (!urlMatches) {
    throw new Error(`no font file urls found in css file ${cssFile}`);
  }

  const fontFiles = new Set;
  const fontExts = ['woff2', 'ttf'];
  for (const url of urlMatches) {
    const relativeFontPath = url.slice(4, -1);
    const ext = relativeFontPath.split('.').pop();
    if (!ext || !fontExts.includes(ext))
      continue;

    // Use an additional '..' because path.join treats the css file as a path, so we cancel that out.
    const fontPath = path.join(cssFile, '..', relativeFontPath);
    fontFiles.add(fontPath);
  }

  console.log(`found ${fontFiles.size} unique font files`);
  console.log(fontFiles);


  // const cacheDir = '.cache';
  // const cacheFontCss = `${cacheDir}/webfont.css`

  // fs.mkdirSync(cacheDir, { recursive: true }); // Ensure dir exists.
  // fs.writeFileSync(cacheFontCss, body);



};

module.exports = minify;

minify('/Users/jjjlaw/Documents/GitHub/trebledj.github.io/_site')
