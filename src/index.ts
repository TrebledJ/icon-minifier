import * as fs from 'fs';
import * as path from 'path';
import { Font, FontEditor, woff2 } from 'fonteditor-core';

import { withCache } from "ultrafetch"

const cachedFetch = withCache(fetch);

const FONT_EXTS = ['ttf', 'otf', 'eot', 'woff', 'woff2'];

// import NodeFetchCache, { FileSystemCache } from 'node-fetch-cache';

// const cache: any = NodeFetchCache;
// const fetch = cache.create({
//   cache: new FileSystemCache(),
// });

type IconClassifier = string;
type Icon = IconClassifier[];

// class FetchCache {
//   cacheDirectory: string = '.cache'

//   mkdir(filepath: string) {
//     fs.mkdirSync(filepath, { recursive: true });
//   }

//   hasFile(filepath: string): boolean {
//     return fs.existsSync(path.join(this.cacheDirectory, filepath));
//   }

//   fetchCache(url: string, init?: RequestInit): Promise<Response> {
//     const opts = urlToHttpOptions(new URL(url));
//     const path = path.join(opts.hostname, opts.
//     if (this.hasFile())
//     return fetch(url, init);
//   }


// }

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
    const iconRegex = /(fa([srb]?|-solid|-regular|-brands) )?(\s*fa-[a-z0-9\-]+)+/g;
    return contents.match(iconRegex)?.map(icon => icon.split(' ')) ?? [];
  }
}

class JsIconExtractor implements FileIconExtractor {
  exts = ['js', 'json']
  extract(contents: string): Icon[] {
    const iconRegex = /(fa([srb]?|-solid|-regular|-brands) )?(\s*fa-[a-z0-9\-]+)+/g;
    return contents.match(iconRegex)?.map(icon => icon.split(' ')) ?? [];
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

      if (!ext || ext === file) // No extension.
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
  // static extractURLsFromCSS(css: string): string[] {
  //   return [];
  // }

  /**
   * 
   * @param unicode Example: [0xf004, 0xf005].
   */
  // constructor(unicode: number[]) {

  // }

  // addFontFile(file: string) {

  // }

  /**
   * Extract font glyphs from a buffer and align them to codepoints starting from U+E000.
   * @param font The font containing the extracted icons.
   * @returns The loaded+modified font, a mapping from old codepoints to new codepoints, and the next usable codepoint within Private Use Area.
   */
  async extractIcons(buffer: Buffer, type: FontEditor.FontType, subset: number[], base: number = 0xE000): Promise<[FontEditor.Font, Map<number, number>, number]> {
    // if (type === 'woff2' && !woff2.isInited) {
    //   await woff2.init();
    // }
  
    const font: any = Font.create(buffer, {
      type,
      subset,
    });
    // font.optimize();
    
    const newMapping: Map<number, number> = new Map; // Maps old codepoints to new codepoints.
    let newCodepoint: number = base;

    // We'll copy any interesting glyfs to newGlyfs, so that we can later replace 
    // all glyfs (including oddballs) in one go with a reassignment.
    const newGlyfs: any[] = [];

    for (const glyf of font.get().glyf) {
      if (glyf.unicode) {
        for (const u of glyf.unicode) {
          if (subset.includes(u)) {
            newMapping.set(u, newCodepoint);
          }
        }
        glyf.unicode = [newCodepoint]; // Set the glyph to a singular, new codepoint.
        newGlyfs.push(glyf);
        newCodepoint += 1;
      }
    }

    font.get().glyf = newGlyfs;
    return [font, newMapping, newCodepoint];

    // const buff = font.write({
    //   toBuffer: true,
    //   type,
    // });
    // return buff;
  }

}

const FA_SPECIAL_CLASSES = ['fab', 'fa-brands', 'far', 'fa-regular', 'fas', 'fa-solid'];


/**
 * Font-Awesome is a bit special in that it splits fonts into separate files.
 * (e.g. brands, regular, solid)
 * @param crawledIcons Icons crawled from existing site pages.
 * @param file The filename, used to determine what icons to look for.
 */
function faFindIconsAssociatedToFile(crawledIcons: Icon[], filename: string): Icon[] {
  let lookFor: string[] = [];
  // Depending on the kind of icon, look for certain key classes.
  if (filename.includes('fa-brand')) {
    // Look for icons associated with fa-brand.
    lookFor = ['fab', 'fa-brands'];
  } else if (filename.includes('fa-regular')) {
    lookFor = ['far', 'fa-regular'];
  } else if (filename.includes('fa-solid')) {
    lookFor = ['fas', 'fa-solid'];
  } else if (filename.includes('compatibility')) {
    console.warn("ignoring compatibility font");
    return [];
  } else {
    throw new Error(`matching for font file hasn't been implemented yet: ${filename}`);
  }

  const filteredIcons: Icon[] = [];

  for (const icon of crawledIcons) {
    let hasSpecialClass = false;
    for (const cls of icon) {
      if (lookFor.includes(cls)) {
        // Yes! This icon has a class matching what we're looking for.
        filteredIcons.push(icon);
        hasSpecialClass = true;
        break;
      } else if (FA_SPECIAL_CLASSES.includes(cls)) {
        hasSpecialClass = true;
      }
    }
    if (!hasSpecialClass) {
      // Still not special? Default to solid.
      // TODO: make default customisable. Or allow it to be ignored.
      if (filename.includes('fa-solid')) {
        filteredIcons.push(icon);
      }
    }
  }

  return filteredIcons;
}


function mapIconsToCodepoints(icons: Icon[], classToCodepoint: Map<string, number>, prefix: string = 'fa-'): number[] {
  return icons.map(classes => {
    for (const cls of classes) {
      const clsNoPrefix = cls.slice(prefix.length);
      if (classToCodepoint.has(clsNoPrefix)) {
        return classToCodepoint.get(clsNoPrefix)!;
      }
    }
    throw new Error(`could not find codepoint for classes: ${classes}`);
  });
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
  await woff2.init();

  const extractor = new SystemExtractor;
  let icons: Icon[] = extractor.crawlAndExtract(directory);
  icons = Array.from(new Set(icons.map(ics => ics.join(' ')))).map(ics => ics.split(' '));
  
  console.log(`found ${icons.length} unique icons`);
  // console.log(icons);

  const htmlFile = extractor.fileMap['html'][0];
  const cssFile = findWebFont(htmlFile);
  console.log('css file:', cssFile);

  if (cssFile === undefined) {
    throw new Error(`could not find font file from ${htmlFile}`)
  }

  const response = await cachedFetch(cssFile, {});
  if (!response.ok) {
    throw new Error(`Bad response for ${cssFile} (${response.status}): ${response.statusText}`);
  }

  const css: string = await response.text();
  // console.log(css);

  const urlMatches: string[] | null = css.match(/url\((['"]?)[^'"]*?\1\)/g);
  if (!urlMatches) {
    throw new Error(`no font file urls found in css file ${cssFile}`);
  }

  const fontFiles: Set<string> = new Set;
  for (const url of urlMatches) {
    const relativeFontPath = url.slice(4, -1);
    const ext = relativeFontPath.split('.').pop();
    if (!ext || ext === relativeFontPath || !FONT_EXTS.includes(ext))
      continue;

    // Use an additional '..' because URL treats the css file as a path, so we cancel that out.
    const fontPath = new URL(`${cssFile}/../${relativeFontPath}`).toString();
    fontFiles.add(fontPath);
  }

  console.log(`found ${fontFiles.size} unique font files`);
  console.log(fontFiles);

  // Get mapping of CSS class names to unicode codepoints.
  const iconUnicodeRegex = /(\.fa-[a-z0-9\-]+:before\s*(?:,\.fa-[a-z0-9\-]+:before)*)\{\s*content:\s*"(\\[0-9a-f]+)"\s*\}/g;
  const iconUnicodePairs = css.match(iconUnicodeRegex);
  if (!iconUnicodePairs) {
    throw new Error("no icon-unicode pairs in css");
  }
  const classUnicodePairs: { classes: string[], codepoint: number }[] = iconUnicodePairs.map(m => {
    const grps = iconUnicodeRegex.exec(m);
    iconUnicodeRegex.lastIndex = 0; // Reset last index: https://stackoverflow.com/q/1520800/10239789.
    if (!grps || grps.length <= 1) throw new Error("unexpected undefined/few capture groups");
    const selectors = grps[1];
    const codepoint = Number('0x' + grps[2].slice(1));
    const classes = selectors.match(/(?<=fa-)[a-z0-9\-]+(?=:before)/g);
    if (!classes) throw new Error("unexpected no classes found in selector");
    return { classes, codepoint };
  });

  // Flatten keys.
  const classToCodepoint: Map<string, number> = new Map;
  classUnicodePairs.forEach(({ classes, codepoint}) => {
    for (const cls of classes) {
      classToCodepoint.set(cls, codepoint);
    }
  });

  // console.log(classUnicodePairs)

  // Now that we have mappings between codepoints and classes, we'll
  // use the classes scraped from the static files to minify the webfont.
  const minifier = new WebFontMinifier;
  let newCodepoint = 0xE000;

  let finalFontasy: FontEditor.Font | null = null;
  let finalCodepointMapping: Map<number, number> = new Map;

  const processedFontFiles: Set<string> = new Set;
  
  for (const fontFile of fontFiles) {
    const response = await cachedFetch(fontFile, {});
    if (!response.ok) {
      console.error(`Bad response for ${fontFile} (${response.status}): ${response.statusText}`)
    }
    const buffer = await response.arrayBuffer();
    const ext = fontFile.split('.').pop();
    if (!ext || ext === fontFile) throw new Error(`no extension for file: ${fontFile}`);
    if (ext !== 'ttf' && ext !== 'woff' && ext !== 'woff2' && ext !== 'eot' && ext !== 'otf')
      throw new Error(`unsupported font extension: ${ext}`);
  
    const filenameBits = fontFile.split('.');
    filenameBits.pop();
    const filename = filenameBits.join('.');
    if (processedFontFiles.has(filename)) {
      console.log(`skipping processing of ${fontFile} as a similar icon file was already encountered`);
      continue;
    }
    processedFontFiles.add(filename);
    
    const assocIcons = faFindIconsAssociatedToFile(icons, fontFile);
    const subset = mapIconsToCodepoints(assocIcons, classToCodepoint);

    const [font, codepointMapping, nextCodepoint] = await minifier.extractIcons(Buffer.from(buffer), ext, subset, newCodepoint);
    
    // Aggregate returned values with outer vars.
    if (!finalFontasy) {
      finalFontasy = font;
    } else {
      finalFontasy.merge(font, { scale: 1 });
    }

    finalCodepointMapping = new Map([...finalCodepointMapping.entries(), ...codepointMapping.entries()]);

    newCodepoint = nextCodepoint;
  }

  // Generate the WOFF2 / TTF.
  const outputFolder = 'output';
  const outputFilename = 'icons';
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }

  const bufferOutWoff2 = finalFontasy!.write({
    toBuffer: true,
    type: 'woff2',
  });
  fs.writeFileSync(path.join(outputFolder, outputFilename + '.woff2'), bufferOutWoff2);

  const bufferOutTtf = finalFontasy!.write({
    toBuffer: true,
    type: 'ttf',
  });
  fs.writeFileSync(path.join(outputFolder, outputFilename + '.ttf'), bufferOutTtf);

  // Generate CSS.
  // TODO: revise generated css, remove unused classes.
  let newCss = fs.readFileSync('template.css').toString();
  newCss += `
@font-face {
  font-family: "Font Awesome 6 Custom";
  font-display: block;
  src: url(../webfonts/${outputFilename}.woff2) format("woff2"), url(../webfonts/${outputFilename}.ttf) format("truetype")
}`;

  const prefix = 'fa-';

  for (const icon of icons) {
    // Get the icon's class name.
    const cls: string = icon.filter(cls => classToCodepoint.has(cls.slice(prefix.length)))[0];

    // Get the original code point of the icon.
    const oldCp = classToCodepoint.get(cls.slice(prefix.length))!;

    // Get the new code point of the icon.
    const newCp = finalCodepointMapping.get(oldCp)!;

    // Add generated CSS.
    const sel = icon.map(cls => '.' + cls).join('') + ':before';
    const css = `${sel}{content:"\\${newCp.toString(16)}"}`;
    newCss += css;
  }

  fs.writeFileSync(path.join(outputFolder, outputFilename + '.css'), newCss);
  console.log("new css:");
  console.log(newCss);
};

module.exports = minify;

minify('/Users/jjjlaw/Documents/GitHub/trebledj.github.io/_site')
