# Icon Minifier

Icon Minifier is a build tool for minifying icon webfonts. These webfonts tend to distribute a plethora of icons (100s or 1000s), more than we typically need. Why do we need to bring in *all* icons when we just use 10-40?

SVGs are one solution to inlining icons, removing the need for icon webfonts entirely. However, I'm too lazy and haven't found the time to migrate to SVGs and deal with their pestilential sizing issues.

So for now, this is a drop-in replacement which shaves off ≥95% of font/CSS bytes in [my site's](https://trebledj.me) Font-Awesome icons.

This is a toy project I started on Labour Day to learn Typescript and play around with frontend optimisations. My code is jank for a few days of prototyping + refactoring so bear with me. (Suggestions welcome.)

## Features

- [x] Crawl a static site (locally), hunting for icon classes in HTML and other files
- [x] Parse CSS and Font Files with Reasonably Rubbish Regex
- [x] Generate new, minified CSS/Font files
- [x] Replace CSS links in HTML files
- [ ] Replace font preload link
- [x] Cache Busting for Output Files
- Fonts
  - [x] FontAwesome
  - [ ] DevIcons
  - [ ] FeatherIcons?
  - [ ] ???


## Running

```sh
tsc
node dist/src/index.ts --help
# or
tsx src/index.ts --help
```

## Usage

```
node dist/src/index.js --help
Usage: index [options] <directory>

Icon Minifier CLI

Options:
  -V, --version                       output the version number
  -e, --exts <extensions>             Specify file extensions to crawl
  -c, --cache                         Enable online file caching
  -o, --output-filename <filename>    Specify output filename
  --output-css-folder <folder>        Specify output CSS folder
  --output-font-folder <folder>       Specify output font folder
  --output-font-family <font-family>  Specify output font family
  --replace-css-links                 Replace existing CSS link tags
  --cache-bust                        Append a file hash to the file name, to allow for cache-busting and long cache durations.
  -h, --help                          display help for command
```
