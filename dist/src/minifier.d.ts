import { FontEditor } from 'fonteditor-core';
import Parser from 'css-simple-parser';
declare const FONT_STYLES: readonly ["normal", "italic"];
type FontStyle = typeof FONT_STYLES[number];
declare const FONT_WEIGHTS: readonly ["100", "200", "300", "400", "500", "600", "700", "800", "900", "bold", "bolder", "lighter", "normal"];
type FontWeight = typeof FONT_WEIGHTS[number];
declare class FontFace {
    family: string;
    style: FontStyle;
    weight: FontWeight;
    srcs: string[];
    clss: string[];
    font: null | FontEditor.Font;
    constructor(family: string, style: FontStyle, weight: FontWeight);
    load(): Promise<void>;
}
type UnparsedIcon = string[];
declare class Icon {
    name: string;
    modifiers: string[];
    constructor(name: string, modifiers?: string[]);
    static parse(unparsed: UnparsedIcon, iconClasses: Set<string>): Icon;
    hasModifier(mod: string): boolean;
    clone(): Icon;
}
export type IconMinifierOptions = {
    crawlExtensions?: string[];
    cacheOnlineFiles?: boolean;
    outputFilename?: string;
    outputCssFolder?: string;
    outputFontFolder?: string;
    outputFontFamily?: string;
    replaceCssLink?: boolean;
};
declare class CSSParser {
    contents: string;
    filename: string;
    ast: ReturnType<typeof Parser['parse']>;
    /**
     * Font Faces.
     *
     * Stores associations between [font files] and [variant classes].
     * For icon sets with a single font-face, variant classes will be empty.
     */
    ffs: FontFace[];
    constructor(contents: string, filename: string);
    getIconToCodepoint(): Map<string, number>;
    static getPrefixFromIconClasses(iconClasses: Set<string>): string;
    getAllClasses(): Set<string>;
    static getRelativeFile(cssFile: string, relativeFile: string): string;
    /**
     * Associate font faces with variants. This allows us to know which font files
     * to use when a particular class is seen.
     *
     * This is really, only useful if there are multiple variants/font-faces in an icon set.
     *
     * For example, in Font Awesome, fa-brands / fab should be associated with
     * the Brands font file.
     */
    private parseFontAssociations;
    static getClassesFromSelector(selector: string): string[];
    static getClassesFromSelectorWithBefore(selector: string): string[];
}
declare class FontManager {
    filenames: Set<string>;
    ffs: FontFace[];
    constructor();
    addFont(ff: FontFace): void;
    addFontFilename(filename: string): void;
    private loadFonts;
    get isMultiVariant(): boolean;
    minify(icons: Icon[], iconToCodepoint: Map<string, number>, base?: number): Promise<[FontEditor.Font, Map<number, string[]>]>;
    save(font: FontEditor.Font): void;
}
export declare class IconMinifier {
    directory: string;
    options: IconMinifierOptions;
    constructor(directory: string, options?: IconMinifierOptions);
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
    minify(): Promise<void>;
    /**
     * Save fonts to files and return the files.
     * @returns Array of font files.
     */
    generateFont(finalFontasy: FontEditor.Font): string[];
    generateCss(cssParser: CSSParser, fontManager: FontManager, fontFiles: string[], nonIconUsedClasses: Set<string>, newCodepointsToClasses: Map<number, string[]>): string;
}
export {};
