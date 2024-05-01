
import {Font, woff2} from 'fonteditor-core';
import fs from 'fs';
import NodeFetchCache, { FileSystemCache } from 'node-fetch-cache';

async function main() {
    const cache: any = NodeFetchCache;
    const fetch = cache.create({
      cache: new FileSystemCache(),
    });
    
    const resp = await fetch("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/webfonts/fa-solid-900.woff2");
    // console.log(await resp.buffer())
    const buffer = await resp.buffer();

    await woff2.init();

    const font = Font.create(buffer, {
        // support ttf, woff, woff2, eot, otf, svg
        type: 'woff2',
        // only read `a`, `b` glyphs
        subset: [0xf005],
        // read font hinting tables, default false
        // hinting: true,
        // read font kerning tables, default false
        // kerning: true,
        // transform ttf compound glyph to simple
        // compound2simple: true,
        // inflate function for woff
        // inflate: undefined,
        // for svg path
        // combinePath: false,
    });
    font.optimize();

    const bufferOut = font.write({
        toBuffer: true,
        type: 'woff2',
    });
    fs.writeFileSync('font.woff2', bufferOut);
}

module.exports = main;

main()
