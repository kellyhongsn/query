const cheerio = require('cheerio');

async function preprocessLink(pageUrl) {
    try {
        // Dynamically import node-fetch
        const fetch = (await import('node-fetch')).default;

        // Fetch the HTML content of the page
        const response = await fetch(pageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch the URL: ${response.statusText}`);
        }

        const htmlText = await response.text();

        // Parse the HTML using Cheerio
        const $ = cheerio.load(htmlText);

        // Extract all href links from <a> tags, along with link text
        const linksArray = $('a')
            .map((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                if (href) {
                    // Resolve relative URLs
                    const absoluteHref = new URL(href, pageUrl).href;
                    return {
                        text,
                        href: absoluteHref
                    };
                }
                return null; // Skip if href is not present
            })
            .get()
            .filter(link => link); // Remove null entries

        // Concatenate all links into a single string
        const links = linksArray
            .map(link => `(${link.text}, ${link.href})`)
            .join(' ');

        // Extract the body text (ignores scripts, styles, etc.)
        const bodyText = $('body')
            .text()
            .replace(/\s+/g, ' ')
            .trim(); // Clean up extra spaces and newlines

        // Return both concatenated links and body text
        return {
            links,
            bodyText
        };
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

// Example usage:
const url = 'https://arxiv.org/abs/2306.05685';
preprocessLink(url).then(result => {
    if (result) {
        console.log('Links:', result.links);
        console.log('Body Text:', result.bodyText);
    }
});
