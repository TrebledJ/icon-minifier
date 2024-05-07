import * as fs from 'fs';
import * as path from 'path';
import { Font, FontEditor, woff2, TTF } from 'fonteditor-core';
import chalk from 'chalk';
import crypto from 'crypto';

import Parser from 'css-simple-parser';
import { createParser } from 'css-selector-parser';

const parseCssSelector = createParser();

import CleanCSS from 'clean-css';
const cssCommentRemover = new CleanCSS({
    level: {
        1: {
            all: false,
            specialComments: 'none',
        }
    }
});

function cssRemoveComments(css: string): string {
    return cssCommentRemover.minify(css).styles;
}

import { withCache } from "ultrafetch"

const cachedFetch = withCache(fetch);
const FONT_EXTS = ['ttf', 'otf', 'eot', 'woff', 'woff2'];


/**
 * Compute the intersection of two arrays.
 * @returns New array of elements which appear in all containers.
 */
function intersection<T>(a: T[], ...args: T[][]): T[] {
    // Boom - triple loop in one line.
    const sets: Set<T>[] = args.map(a2 => new Set(a2));
    return a.filter(e => sets.every(a2 => a2.has(e)));
}

function md5(str: string | Buffer): string {
    return crypto.createHash('md5').update(str).digest('hex');
}

const FONT_STYLES = ['normal', 'italic'] as const;
const FONT_STYLES_REGEX = new RegExp(`font-style:\s*(${FONT_STYLES.join('|')})`);
type FontStyle = typeof FONT_STYLES[number];

function getFontStyle(str: string): FontStyle | null {
    const grps = FONT_STYLES_REGEX.exec(str);
    return (!grps || grps.length <= 1) ? null : <FontStyle>grps[1];
}

const FONT_WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'bold', 'bolder', 'lighter', 'normal'] as const;
const FONT_WEIGHTS_REGEX = new RegExp(`font-weight:\s*(${FONT_WEIGHTS.join('|')})`);
type FontWeight = typeof FONT_WEIGHTS[number];

function getFontWeight(str: string): FontWeight | null {
    const grps = FONT_WEIGHTS_REGEX.exec(str);
    return (!grps || grps.length <= 1) ? null : <FontWeight>grps[1];
}

function getFontFamily(str: string): string | null {
    const grps = /font-family:\s*"(.*?)"/.exec(str);
    return (!grps || grps.length <= 1) ? null : grps[1];
}

function getFontSrcs(str: string): string[] {
    return str.match(/url\((['"]?)[^'"]*?\1\)/g)?.map(url => url.slice(4, -1)) ?? [];
}

class FontFace {
    family: string
    style: FontStyle
    weight: FontWeight
    srcs: string[] // Fully resolved URLs or local paths.
    clss: string[] // Associated class names.

    font: null | FontEditor.Font

    constructor(family: string, style: FontStyle, weight: FontWeight) {
        this.family = family;
        this.style = style;
        this.weight = weight;
        this.srcs = [];
        this.clss = [];
        this.font = null;
    }

    async load(): Promise<void> {
        // Try opening any files from srcs.
        // TODO: do they need to be the same type to properly combine glyphs?
        for (const src of this.srcs) {
            const buffer = await getContent(src, { buffer: true })
            const type = <FontEditor.FontType>path.extname(src).slice(1);
            this.font = Font.create(buffer, { type });
            // TODO: error handling?
            return;
        }
    }
}

function isURL(file: string): boolean {
    return file.startsWith('http:') || file.startsWith('https:');
}

function isRelativePath(str: string): boolean {
    return str.startsWith('./') || str.startsWith('../') || (!str.startsWith('/') && !isURL(str));
}

async function getContent(fileOrUrl: string, options?: { buffer: false }): Promise<string>;
async function getContent(fileOrUrl: string, options: { buffer: true }): Promise<Buffer>;

async function getContent(fileOrUrl: string, options?: { buffer: boolean }): Promise<string | Buffer> {
    if (isURL(fileOrUrl)) {
        const response = await cachedFetch(fileOrUrl, {});
        if (!response.ok) {
            throw new Error(`Bad response for ${fileOrUrl} (${response.status}): ${response.statusText}.`);
        }
        if (options && options.buffer) {
            return Buffer.from(await response.arrayBuffer());
        } else {
            return await response.text();
        }
    } else {
        return fs.readFileSync(fileOrUrl).toString()
    }
}

function findPrefix(words: string[]): string {
    // check border cases size 1 array and empty first word)
    if (!words[0] || words.length == 1) return words[0] || "";
    let i = 0;
    // while all words have the same character at position i, increment i
    while (words[0][i] && words.every(w => w[i] === words[0][i]))
        i++;

    // prefix is the substring from the beginning to the last successfully checked i
    return words[0].substring(0, i);
}

type UnparsedIcon = string[]; // An unparsed icon is a list of classes.

class Icon {
    name: string
    modifiers: string[]

    constructor(name: string, modifiers: string[] = []) {
        this.name = name;
        this.modifiers = modifiers;
    }

    static parse(unparsed: UnparsedIcon, iconClasses: Set<string>): Icon | null {
        const names = unparsed.filter(cls => iconClasses.has(cls));
        if (names.length > 1) {
            throw new Error(`Detected icon with more than one icon class: ${names.join(' ')}.`);
        } else if (names.length === 0) {
            // throw new Error(`Detected icon with no name: ${unparsed.join(' ')}.`);
            console.log(`Detected icon with no name: ${unparsed.join(' ')}. (Skipping.)`);
            return null;
        }

        const name = names[0];
        return new Icon(name, unparsed.filter(cls => cls !== name));
    }

    hasModifier(mod: string): boolean {
        return this.modifiers.includes(mod);
    }

    clone(): Icon {
        return new Icon(this.name, [...this.modifiers]);
    }
}

export type IconMinifierOptions = {
    // Extensions to crawl.
    exts?: string[],
    
    // Cache online files.
    cache?: boolean,

    outputFilename?: string,
    outputCssFolder?: string,
    outputFontFolder?: string,
    outputFontFamily?: string,
    replaceCssLinks?: boolean,

    // Adds a filehash at the end of filenames.
    cacheBust?: boolean,
};

const iconMinifierDefaultOptions = Object.freeze({
    exts: ['html'],
    cache: true,
    outputFilename: 'icons',
    outputCssFolder: './css',
    outputFontFolder: './webfonts',
    outputFontFamily: 'Custom Minified Font',
    replaceCssLinks: false,
    cacheBust: false,
});

class Crawler {
    fileMap: Map<string, string[]>
    // private matchedCssFilePatterns: string[] = []

    private static cssFilePatterns: string[] = ['font-?awesome'] // TODO: add devicon, etc.

    constructor() {
        this.fileMap = new Map;
    }

    indexFiles(directory: string, exts: string[]): void {
        const files = <string[]>fs.readdirSync(directory, { recursive: true });

        for (const filename of files) {
            const ext = filename.split('.').pop();
            if (!ext || ext === filename) // No extension.
                continue;

            const file = path.join(directory, filename.toString());

            if (exts.includes(ext)) {
                if (!this.fileMap.has(ext))
                    this.fileMap.set(ext, []);

                this.fileMap.get(ext)!.push(file);
            }
        }

        console.log(`Indexed ${[...this.fileMap.values()].map(a => a.length).reduce((a, b) => a + b, 0)} files.`);
    }

    /**
     * Search for CSS files from <link> elements.
     * @param exts List of extensions to crawl.
     * @returns Unique array of css files.
     */
    findCssFiles(exts: string[]): string[] {
        const files = [];
        for (const pat of Crawler.cssFilePatterns) {
            const regex = new RegExp(`(?<=")[^"]*${pat}[^"]*\\.css[^"]*(?=")`);
            const matches = this.findByRegex(regex, exts);
            if (matches.length === 0)
                continue;

            // this.matchedCssFilePatterns.push(pat);
            files.push(...matches);
        }
        return Array.from(new Set(files));
    }

    /**
     * Crawl files for icons matching a prefix regex expression.
     * @param exts List of extensions to crawl.
     * @returns Unique array of icons with variants/modifiers of the same prefix.
     */
    findIcons(prefix: string, exts: string[], extraClasses: string[] = []): UnparsedIcon[] {
        const extra = extraClasses.length > 0 ? `|${extraClasses.join('|')}` : '';
        const clss = `((${prefix}[a-z0-9\\-]+)${extra})`;
        const rgx = new RegExp(`\\b(${clss}(\\s+${clss})*)\\b`, 'g');
        const matches = this.findByRegex(rgx, exts);

        // Sort the classes before deduplicating them.
        // We want `fab fa-google` == `fa-google fab`.
        const sorted = matches.map(s => s.split(/\s+/).sort().join(' '));
        return Array.from(new Set(sorted)).map(s => s.split(' '));
    }

    private findByRegex(regex: RegExp, exts: string[]): string[] {
        this.checkIfIndexed(exts);

        const results: string[] = []
        for (const ext of exts) {
            // TODO: revise async with https://stackoverflow.com/questions/9618142/asynchronously-reading-and-caching-multiple-files-in-nodejs.
            // https://github.com/caolan/async?tab=readme-ov-file.

            for (const file of this.fileMap.get(ext)!) {
                const contents = fs.readFileSync(file, { encoding: 'utf8' });
                let matches: string[] | null = contents.match(regex);
                if (!matches)
                    continue;

                results.push(...matches);
            }
        }
        return results;
    }

    private checkIfIndexed(exts: string[]) {
        for (const ext of exts) {
            if (!this.fileMap.has(ext)) {
                throw new Error(`unknown extension ${ext}: not indexed`);
            }
        }
    }

    replaceCssLinks(exts: string[], oldUrl: string, newUrl: string): void {
        this.checkIfIndexed(exts);

        for (const ext of exts) {
            for (const file of this.fileMap.get(ext)!) {
                const contents = fs.readFileSync(file).toString();
                fs.writeFileSync(file, contents.replace(oldUrl, newUrl));
            }
        }
    }
}

class CSSParser {
    // Not a parser. Just a supercharged regex matcher. :D

    contents: string
    filename: string
    ast: ReturnType<typeof Parser['parse']>

    /**
     * Font Faces.
     * 
     * Stores associations between [font files] and [variant classes].
     * For icon sets with a single font-face, variant classes will be empty.
     */
    ffs: FontFace[]

    constructor(contents: string, filename: string) {
        this.contents = cssRemoveComments(contents);
        this.filename = filename;
        this.ast = Parser.parse(this.contents);
        this.ffs = this.parseFontAssociations();
    }

    // getIconClasses(): Set<string> {
    //     const set: Set<string> = new Set;
    //     for (const node of this.ast.children) {
    //         // Get the unicode.
    //         const grps = /\s*content:\s*"(\\[0-9a-f]+)"\s*/.exec(node.body);
    //         if (!grps || grps.length <= 1)
    //             continue;

    //         // const unicode = grps[1];
            
    //         // Get the classes.
    //         const clss = CSSParser.getClassesFromSelectorWithBefore(node.selector);
    //         clss.forEach(cls => set.add(cls));
    //     }
    //     return set;
    // }
    
    getIconToCodepoint(): Map<string, number> {
        const map: Map<string, number> = new Map;
        for (const node of this.ast.children) {
            const grps = /\s*content:\s*"(\\[0-9a-f]+)"\s*/.exec(node.body);
            if (!grps || grps.length <= 1)
                continue;
    
            // const unicode = grps[1];
            const codepoint = Number('0x' + grps[1].slice(1));

            // Get the classes.
            const clss = CSSParser.getClassesFromSelectorWithBefore(node.selector);
            clss.forEach(cls => map.set(cls, codepoint));
        }
        return map;
    }

    static getPrefixFromIconClasses(iconClasses: Set<string>): string {
        const arr = Array.from(iconClasses);

        // Sample classes from quartiles (every 25%) and obtain the prefix.
        // This is to avoid situations where nearby icons have similar names and the prefix is extra long.
        const samples = [...Array(4).keys()].map(i => arr[Math.floor(i * arr.length / 4)])
        return findPrefix(samples);
    }

    getAllClasses(): Set<string> {
        const set: Set<string> = new Set;
        for (const node of this.ast.children) {
            const trimmed = node.selector.trimStart();
            if (!trimmed.startsWith('@') && !trimmed.startsWith(':')) {
                CSSParser.getClassesFromSelector(node.selector).forEach(cls => {
                    set.add(cls);
                });
            }
        }
        return set;
    }

    // /**
    //  * Find font files from a given CSS file.
    //  * This also finds associations with variant classes by matching CSS selectors with font faces.
    //  * @returns Unique array of tuples [font files, associated font classes].
    //  */
    // getFontFiles(): string[] {
    //     // Handle cases where single-quotes, double-quotes, or no quotes wrap the url.
    //     let matches: string[] | null = this.contents.match(/\burl\((['"]?)[^'"]*?\1\)/g);
    //     if (!matches) {
    //         return [];
    //     }

    //     matches = matches.filter(url => {
    //         const ext = url.split('.').pop();
    //         return ext && ext !== url && FONT_EXTS.includes(ext);
    //     });
    //     return Array.from(new Set(matches));
    // }

    static getRelativeFile(cssFile: string, relativeFile: string) {
        if (isRelativePath(relativeFile)) {
            if (isURL(cssFile)) {
                // Use the URL class to parse relative font paths.
                const cssUrl = new URL(cssFile);

                // cd-up once to account for the CSS base filename.
                return new URL(`${cssUrl.origin}${cssUrl.pathname}/../${relativeFile}`).toString();
            } else {
                // Strip any query component.
                const pathname = cssFile.includes('?') ? cssFile.split('?')[0] : cssFile;

                // Use path.join to parse relative path.
                return path.join(path.dirname(pathname), relativeFile);
            }
        } else {
            return relativeFile;
        }
    }

    /**
     * Associate font faces with variants. This allows us to know which font files
     * to use when a particular class is seen.
     * 
     * This is really, only useful if there are multiple variants/font-faces in an icon set.
     * 
     * For example, in Font Awesome, fa-brands / fab should be associated with 
     * the Brands font file.
     */
    private parseFontAssociations(): FontFace[] {
        // TODO: replace CSS selector parser with regex? The lib is pretty jank anyways.
        const fontFaces: FontFace[] = [];
        const variantClasses: Map<string, FontFace> = new Map;

        // Scan the AST for possible variant classes. These are classes with a `font-family` property.
        for (const node of this.ast.children) {
            if (node.body.includes('font-family') && node.selector.trim() !== '@font-face') {
                CSSParser.getClassesFromSelector(node.selector).forEach(cls => {
                    variantClasses.set(cls, new FontFace('', 'normal', 'normal'));
                });
            }
        }

        // Gather more info from AST.
        for (const node of this.ast.children) {
            const trimmed = node.selector.trim();
            if (trimmed === '@font-face') {
                const family = getFontFamily(node.body);
                if (!family) {
                    console.warn(chalk.yellow("Skipping @font-face without `font-family`."));
                    continue;
                }

                const style = getFontStyle(node.body);
                if (!style) {
                    console.warn(chalk.yellow("Skipping @font-face without `font-style`."));
                    continue;
                }

                const weight = getFontWeight(node.body);
                if (!weight) {
                    console.warn(chalk.yellow("Skipping @font-face without `font-weight`."));
                    continue;
                }

                const ff = new FontFace(family, style, weight);
                const srcs = getFontSrcs(node.body);
                ff.srcs = srcs;

                // Assume matches are filenames and resolve relative paths.
                ff.srcs = ff.srcs.map(m => CSSParser.getRelativeFile(this.filename, m));

                fontFaces.push(ff);

            } else if (trimmed.startsWith('@') || trimmed.startsWith(':')) {
                // pass.

            } else {
                const sel = parseCssSelector(node.selector);

                for (const rule of sel.rules) {
                    if (rule.type === 'Rule') {
                        for (const item of rule.items) {
                            if (item.type === 'ClassName' && variantClasses.has(item.name)) {
                                // Found a rule with a variant-class selector.
                                // See if we can find any family, style, or weight props.
                                const font = variantClasses.get(item.name);
                                if (!font)
                                    continue;

                                // Update fields with anything we find.
                                const family = getFontFamily(node.body);
                                const style = getFontStyle(node.body);
                                const weight = getFontWeight(node.body);
                                
                                if (family)
                                    font.family = family;
                                if (style)
                                    font.style = style;
                                if (weight)
                                    font.weight = weight;
                            }
                        }
                    }
                }

            }
        }

        // Associate font-faces with CSS classes, and save the match into `fontFaces`.
        for (const ff of fontFaces) {
            const matchedCls: string[] = [];
            variantClasses.forEach(({ family, style, weight }, cls) => {
                if (ff.family === family && ff.style === style && ff.weight === weight) {
                    matchedCls.push(cls);
                }
            });
            for (const cls of matchedCls) {
                console.log(`Associated class ${cls} with font face ${ff.family}, ${ff.style}, ${ff.weight}.`)
                // Copy over classes.
                ff.clss.push(cls);
                variantClasses.delete(cls);
            }
        }

        return fontFaces;
    }

    static getClassesFromSelector(selector: string): string[] {
        const s = selector.trimStart();
        if (s.startsWith('@') || s.startsWith(':'))
            return [];

        const clss: string[] = [];
        const sel = parseCssSelector(selector);
        sel.rules.filter(r => r.type === 'Rule').forEach(rule => {
            for (const item of rule.items) {
                if (item.type === 'ClassName') {
                    clss.push(item.name);
                    // Welcome to pretty-braces haven, aka nested code hell.
                    break;
                }
            }
        });
        return clss;
    }

    static getClassesFromSelectorWithBefore(selector: string): string[] {
        const s = selector.trimStart();
        if (s.startsWith('@') || s.startsWith(':'))
            return [];

        const clss: string[] = [];
        const sel = parseCssSelector(selector);
        sel.rules.filter(r => r.type === 'Rule').forEach(rule => {
            if (rule.items.length === 2
                && rule.items[0].type === 'ClassName'
                && rule.items[1].type === 'PseudoElement' && rule.items[1].name === 'before') {
                clss.push(rule.items[0].name);
            } else if (rule.items.length > 2) {
                console.log(`Skipped complex rule in selector: ${selector}`)
            }
        });
        return clss;
    }
}

class FontManager {
    filenames: Set<string>
    ffs: FontFace[]

    constructor() {
        this.filenames = new Set;
        this.ffs = [];
    }

    addFont(ff: FontFace): void {
        for (const src in ff.srcs) {
            this.addFontFilename(src);
        }
        this.ffs.push(ff);
    }
    addFontFilename(filename: string): void {
        const fnNoExt = path.parse(filename).name;
        if (this.filenames.has(fnNoExt))
            return;

        this.filenames.add(fnNoExt);
    }

    // private async loadFonts(): Promise<FontEditor.Font[]> {
    //     const fonts = [];
    //     for (const filename of this.filenames) {
    //         const buffer = await getContent(filename, { buffer: true });
    //         const type = <FontEditor.FontType>path.extname(filename).slice(1);
    //         const font = Font.create(buffer, {
    //             type,
    //         });
    //         fonts.push(font);
    //     }
    //     return fonts;
    // }
    private async loadFonts(): Promise<void> {
        for (const ff of this.ffs) {
            await ff.load();
        }
    }

    get isMultiVariant() {
        return this.ffs.length > 1;
    }

    async minify(icons: Icon[], iconToCodepoint: Map<string, number>, base: number = 0xE000): Promise<[FontEditor.Font, Map<number, string[]>]> {
        if (this.ffs.length === 0)
            throw new Error("No fonts added.");

        const glyfs: TTF.Glyph[] = [];

        // We'll want to keep track of old-to-new mappings.
        // If we encounter a similar mapping, but with a different class, it should map to the same new codepoint.
        // e.g. `fab fa-google` == `fa-brands fa-google`; and should map to the same new codepoint.
        // This relies on FontFace objects being unchanged. Don't use with new FontFace objects.
        const oldCodepointsToNew: Map<FontFace, Map<number, number>> = new Map;

        // We'll store mappings of full-stringified icons to their new codepoints.
        const newCodepointsToClasses: Map<number, string[]> = new Map;
        const toIconSelector = (icon: Icon) => `.${icon.name}.${icon.modifiers.join('.')}`;
        // toIconSelector will be used stringify icons so no duplicates will be hit.

        // New glyphs will be stored at new locations.
        // This is more important for multi-variant classes, as codepoints may clash.
        let newCodepoint_value = base;
        const newCodepoint = () => {
            const val = newCodepoint_value;
            newCodepoint_value += 1;
            return val;
        }
        const addGlyph = (ff: FontFace, codepoint: number): number | null => {
            const gs = ff.font!.find({ unicode: [codepoint] });
            if (gs.length === 0) {
                return null;
            }

            // Clone glyph. Don't modify the original object.
            const g = JSON.parse(JSON.stringify(gs[0]));

            // Obtain the new codepoint, or make a new one if it doesn't exist.
            let newcp = oldCodepointsToNew.get(ff)!.get(codepoint);
            if (!newcp) {
                newcp = newCodepoint();
                oldCodepointsToNew.get(ff)!.set(codepoint, newcp);
                
                // Add the glyph to our packed list.
                g.unicode = [newcp];
                glyfs.push(g);
            }

            return newcp;
        };

        const registerMapping = (newCodepoint: number, icon: Icon) => {
            // Add the icon selector to the associated codepoint.
            if (!newCodepointsToClasses.has(newCodepoint)) {
                newCodepointsToClasses.set(newCodepoint, []);
            }
            newCodepointsToClasses.get(newCodepoint)!.push(toIconSelector(icon));
        };

        const hasIntersection = (ff: FontFace, icon: Icon) => {
            return intersection(ff.clss, icon.modifiers).length >= 1;
        };

        await this.loadFonts();
        this.ffs.forEach(ff => oldCodepointsToNew.set(ff, new Map));

        if (this.isMultiVariant) {
            for (const icon of icons) {
                const cp = iconToCodepoint.get(icon.name);
                if (!cp)
                    throw new Error(`No codepoint found for ${icon.name}.`);

                // Find out which variant(s) to pull from, based on icon modifiers.
                const ff: FontFace | null = this.ffs.filter(ff => hasIntersection(ff, icon))?.[0] ?? null;
                if (!ff) {
                    // Couldn't match the font. Use all variants which have a matching codepoint. :D
                    this.ffs.forEach(ff => {
                        // Clone icon and add modifier, so that a unique insertion will be made.
                        const newcp = addGlyph(ff, cp);
                        if (!newcp)
                            return; // It's normal if we can't find a codepoint for some glyphs. Some variants don't have codepoints for certain icons.
                            // throw new Error(`Could not find glyphs for ${cp.toString(16)} (${icon.name}).`);

                        ff.clss.forEach(cls => {
                            const tmpIcon = icon.clone();
                            tmpIcon.modifiers.push(cls);
                            registerMapping(newcp, tmpIcon);
                        });
                    });
                } else {
                    // Use the matched font.
                    const newcp = addGlyph(ff, cp);
                    if (!newcp)
                        throw new Error(`Could not find glyphs for ${cp.toString(16)} (${icon.name}).`);

                    registerMapping(newcp, icon);
                }
            }

        } else {
            // Just one variant.
            const ff: FontFace = this.ffs[0];
            for (const icon of icons) {
                const cp = iconToCodepoint.get(icon.name);
                if (!cp)
                    throw new Error(`No codepoint found for ${icon.name}.`);
            
                const newcp = addGlyph(ff, cp);
                if (!newcp)
                    throw new Error(`Could not find glyphs for ${cp.toString(16)} (${icon.name}).`);

                registerMapping(newcp, icon);
            }
        }

        // Generate Font.
        // const font = JSON.parse(JSON.stringify(this.ffs[0].font))
        // font.get().glyf = glyfs;

        const tmpBuffer = this.ffs[0].font!.write({ type: "woff2" });
        const font = Font.create(tmpBuffer, { type: "woff2" });
        font.get().glyf = glyfs;

        return [font, newCodepointsToClasses];
    }
}


export class IconMinifier {
    directory: string
    options: IconMinifierOptions

    constructor(directory: string, options: IconMinifierOptions = iconMinifierDefaultOptions) {
        this.directory = directory;
        this.options = options;

        const opts = <{[x:string]:any}>this.options;
        for (const opt in iconMinifierDefaultOptions) {
            if (opts[opt] === undefined)
                opts[opt] = (<{[x:string]:any}>iconMinifierDefaultOptions)[opt];
        }

        console.log("Extensions: " + this.options.exts!.join(', '));
    }

    /**
     * 1. Crawl static files locating icon CSS files.
     * 
     * 2. Parse the CSS and construct a mapping from icon classes to codepoint. (.fa-example:before{content:"\e000"})
     *      Also when parsing: identify extra classes (for animation, size, etc.).
     * 
     *      2.1. Associate font faces with CSS classes. This allows us to determine which file to use for a given icon.
     *              (If there are multiple files.)
     * 
     * 3. Parse font files and determine available codepoints.
     * 
     * 4. Crawl static files (HTML/JS/JSON) for icons (icon class + variants + modifiers).
     *      If an icon has no associated variant, then we should account for *all* variants.
     *      This introduces some redundancy and the icon set may no longer be minimal.
     *      'modifiers' refers to the extra CSS classes.
     * 
     * 5. Transform the crawled icons into a more comprehensible structure, using the data structures from the CSS/font parsing.
     * 
     * 6. Construct a minimal font set, using the new structure.
     *      This should map icons to available codepoints.
     *      If an icon has no variant, include the icon from each variant.
     * 
     * 7. Based on 4, make a list of used classes.
     * 
     * 8. Construct a CSS based on the font file.
     *      Also, include any modifier classes found.
     * 
     * 9. Replace CSS <link> in HTML files.
     */
    async minify() {
        await woff2.init();

        const crawler = new Crawler();
        const fontManager = new FontManager();

        // 1.
        crawler.indexFiles(this.directory, this.options.exts!);
        const cssFiles = crawler.findCssFiles(['html']);

        if (cssFiles.length === 0) {
            console.log(`No css files found. Nothing to do.`);
            return;
        }

        console.log(`Processing ${cssFiles.length} file(s).`);

        for (const cssFile of cssFiles) {
            console.log(chalk.blue(`Processing file: ${cssFile}`));
            // 2.
            const css = await getContent(cssFile);
            const cssParser = new CSSParser(css, cssFile);

            // Find oddball classes that don't use the prefix, and use those classes in our crawl for icons later.
            const allClasses = cssParser.getAllClasses();
            const allClassesArr = Array.from(allClasses);
            // const iconClasses = cssParser.getIconClasses();
            const iconToCodepoint: Map<string, number> = cssParser.getIconToCodepoint();
            const iconClasses: Set<string> = new Set(iconToCodepoint.keys());
            const prefix = CSSParser.getPrefixFromIconClasses(iconClasses);

            const specialClasses = allClassesArr.filter(x => !iconClasses.has(x));
            const nonPrefixClasses = allClassesArr.filter(x => !x.startsWith(prefix));

            for (const ff of cssParser.ffs) {
                // Don't add fonts which don't have any associated font classes.
                // No class = Font not used.
                if (ff.clss.length > 0) {
                    fontManager.addFont(ff);
                }
            }

            // 4.
            const unparsedIcons = crawler.findIcons(prefix, this.options.exts!, nonPrefixClasses);

            // 5.
            const icons = <Icon[]>unparsedIcons.map(u => Icon.parse(u, iconClasses)).filter(x => x !== null);
            console.log(chalk.blue(`Parsed ${icons.length} unique icons.`));
            console.log(icons.map(icon => [icon.name, ...icon.modifiers].join('.')).sort().join(', '));

            // 6.
            const [font, newCodepointsToClasses] = await fontManager.minify(icons, iconToCodepoint);
            const fontFiles = this.generateFont(font);

            // 7.
            const usedClasses = new Set(icons.map(icon => [icon.name, ...icon.modifiers]).flat());
            const nonIconUsedClasses = new Set(specialClasses.filter(cls => usedClasses.has(cls)));

            // 8.
            const newCss = this.generateCss(cssParser, fontManager, fontFiles, nonIconUsedClasses, newCodepointsToClasses);
            const newCssFile = this.saveCss(newCss);

            // 9.
            const relativeNewCssFile = path.relative(this.directory, newCssFile);
            crawler.replaceCssLinks(['html'], cssFile, '/' + relativeNewCssFile);

            console.log("Done!");

            // 10. Stats.
            let oldFontBytes = 0;
            for (const ff of fontManager.ffs) {
                const len = ff.font!.write({ toBuffer: true, type: "woff2" }).byteLength;
                oldFontBytes += len;
            }

            const newFontBytes = font.write({ toBuffer: true, type: "woff2" }).byteLength;
            console.log(chalk.blue(`Font:`));
            console.log(chalk.blue(`\tBefore: ${oldFontBytes}`));
            console.log(chalk.blue(`\tAfter:  ${newFontBytes} (saved ${Math.floor((oldFontBytes - newFontBytes) * 1000 / oldFontBytes) / 10}%)`));
            
            const oldCssBytes = css.length;
            const newCssBytes = newCss.length;
            console.log(chalk.blue(`CSS:`));
            console.log(chalk.blue(`\tBefore: ${oldCssBytes}`));
            console.log(chalk.blue(`\tAfter:  ${newCssBytes} (saved ${Math.floor((oldCssBytes - newCssBytes) * 1000 / oldCssBytes) / 10}%)`));
        }
    }

    /**
     * Save fonts to files and return the files.
     * @returns Array of font files.
     */
    generateFont(finalFontasy: FontEditor.Font): string[] {
        const dir = path.join(this.directory, this.options.outputFontFolder!);
        const outputFilename = this.options.outputFilename;
        const types = ['woff2', 'ttf'] as const;

        const files: string[] = [];

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        for (const type of types) {
            const buffer = finalFontasy.write({
                toBuffer: true,
                type,
            });
            
            let outputFilenameWithHash = outputFilename;
            if (this.options.cacheBust) {
                outputFilenameWithHash += '-' + md5(buffer).slice(0, 16);
            }

            const file = `${outputFilenameWithHash}.${type}`;
            console.log(`Writing font to ${file}...`);
            fs.writeFileSync(path.join(dir, file), buffer);
            files.push(file);
        }

        return files;
    }
    
    generateCss(cssParser: CSSParser,
                fontManager: FontManager,
                fontFiles: string[],
                nonIconUsedClasses: Set<string>,
                newCodepointsToClasses: Map<number, string[]>
                ): string {
        let css = "";

        const fam = this.options.outputFontFamily!;
        const outputCssFolder = this.options.outputCssFolder!;
        const outputFontFolder = this.options.outputFontFolder!;
        // const outputFilename = this.options.outputFilename!;
        const relativePathToFontFolder = path.relative(outputCssFolder, outputFontFolder);

        const format: {[x: string]: string} = {
            ".woff2": "woff2",
            ".ttf": "truetype",
        };
        const srcs = fontFiles.map(file => `url(${path.join(relativePathToFontFolder, file)}) format("${format[path.extname(file)]}")`);

        // Font-face.
        css += `
        @font-face {
            font-family: "${fam}";
            font-style: normal;
            font-variant: normal;
            font-display: block;
            src: ${srcs.join(', ')}
        }`;

        // Font classes.
        const sel = fontManager.ffs.map(ff => ff.clss.map(c => `.${c}`)).flat().join(', ');
        css += `
        ${sel} {
            font-family: "${fam}";
            font-style: normal;
            font-variant: normal;
            -moz-osx-font-smoothing: grayscale;
            -webkit-font-smoothing: antialiased;
            display: inline-block;
            line-height: 1;
            text-rendering: auto  
        }`;

        // Special classes.
        cssParser.ast.children.forEach(node => {
            // If the selector uses any non-icon and seen classes, then include the rule.
            // And exclude any rules which modify main font props.
            if (CSSParser.getClassesFromSelector(node.selector).some(cls => nonIconUsedClasses.has(cls))
                && !node.body.match(/font-(family|style|weight)/)) {
                css += `\n${node.selector}{${node.body}}\n`;
            }
        });

        // Codepoints.
        Array.from(newCodepointsToClasses).forEach(([codepoint, clss]) => {
            css += `
            ${clss.map(cls => cls + ':before').join(', ')} {
                content: "\\${codepoint.toString(16)}"
            }
            `;
        });
        
        const minifiedCss: string = new CleanCSS({}).minify(css).styles;
        return minifiedCss;
    }

    saveCss(css: string): string {
        const outputCssFolder = this.options.outputCssFolder!;
        // const outputFontFolder = this.options.outputFontFolder!;
        let outputFilename = this.options.outputFilename!;

        if (this.options.cacheBust) {
            outputFilename += '-' + md5(css).slice(0, 16);
        }

        const outputFile = path.join(this.directory, outputCssFolder, outputFilename + '.css');

        console.log(`Writing css to ${outputFile}...`);
        if (!fs.existsSync(path.dirname(outputFile))) {
            fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        }
        fs.writeFileSync(outputFile, css);
        return outputFile;
    }
}
