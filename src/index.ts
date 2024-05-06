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
        .option('-c, --cache', 'Enable online file caching')
        .option('-o, --output-filename <filename>', 'Specify output filename')
        .option('--output-css-folder <folder>', 'Specify output CSS folder')
        .option('--output-font-folder <folder>', 'Specify output font folder')
        .option('--output-font-family <font-family>', 'Specify output font family')
        .option('--replace-css-links', 'Replace existing CSS link tags')
        .action(async (directory: string, options: IconMinifierOptions) => {
            const minifier = new IconMinifier(directory, options);
            console.log("Options: " + JSON.stringify(options));
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
