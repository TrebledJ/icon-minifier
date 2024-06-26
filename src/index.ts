#!/usr/local/bin/node

import { Command } from 'commander';
import chalk from 'chalk';
import { IconMinifier, IconMinifierOptions } from './minifier.js';

async function main() {
    const program = new Command();

    program
        .version('0.0.1')
        .description('Icon Minifier CLI')
        .arguments('<directory>')
        .option('-e, --exts <extensions>', 'Specify file extensions to crawl', (value: string) => value.split(','))
        .option('--no-cache', 'Don\'t cache downloaded files. (Files are cached by default.)')
        .option('-o, --output-filename <filename>', 'Specify output filename')
        .option('--output-css-folder <folder>', 'Specify output CSS folder')
        .option('--output-font-folder <folder>', 'Specify output font folder')
        .option('--output-font-family <font-family>', 'Specify output font family')
        .option('--replace-css-links', 'Replace existing CSS link tags')
        .option('--cache-bust', 'Append a file hash to the file name, to allow for cache-busting and long cache durations.')
        .action(async (directory: string, options: IconMinifierOptions) => {
            const minifier = new IconMinifier(directory, options);
            try {
                await minifier.minify()
            } catch (error) {
                console.error(chalk.red(error));
                return;
            }

            console.log(chalk.green('Minification completed successfully!'));
        });

    await program.parseAsync(process.argv);
}

main()
