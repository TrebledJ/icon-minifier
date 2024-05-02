
import {Font, woff2} from 'fonteditor-core';
import fs from 'fs';
// import NodeFetchCache, { FileSystemCache } from 'node-fetch-cache';

import { withCache } from "ultrafetch"

const cachedFetch = withCache(fetch);

async function main() {
    const resp = await cachedFetch("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/webfonts/fa-solid-900.woff2");
    // console.log(await resp.buffer())
    const buffer = Buffer.from(await resp.arrayBuffer());

    await woff2.init();

    const font = Font.create(buffer, {
        // support ttf, woff, woff2, eot, otf, svg
        type: 'woff2',
        // only read `a`, `b` glyphs
        // subset: [0xf005],
        subset: [0xeff0, 0xf005],
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
    font.sort();
    font.merge(font);

    const bufferOut = font.write({
        toBuffer: true,
        type: 'woff2',
    });
    fs.writeFileSync('font.woff2', bufferOut);
}

module.exports = main;

main()
