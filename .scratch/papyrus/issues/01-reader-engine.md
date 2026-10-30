# Which reader engine renders epub and mobi/azw3 in the browser?

Type: research
Status: open

## Question

Compare the candidate browser reader engines (at least foliate-js, epub.js, Readium ts-toolkit/Thorium web) for a React PWA. For each: does it render epub **and** mobi/azw3 natively (if not, what server-side conversion would mobi need, e.g. Calibre `ebook-convert`, and how heavy is that in a Docker image)? Does it support paginated and scroll modes, theming/typography, a TOC, in-book search, text selection for Highlights, and a stable locator (EPUB CFI or similar) to anchor Reading Progress, Bookmarks, and Highlights? Can it work offline from a Blob or ArrayBuffer? What are its licence, maintenance status, and React integration story? Recommend one.
