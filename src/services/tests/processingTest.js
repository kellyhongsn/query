const cheerio = require('cheerio');

async function preprocessLink(pageUrl) {
    try {
        const fetch = (await import('node-fetch')).default;

        const response = await fetch(pageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch the URL: ${response.statusText}`);
        }

        const htmlText = await response.text();

        const $ = cheerio.load(htmlText);

        const linksArray = $('a')
            .map((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text().trim();
                if (href) {

                    const absoluteHref = new URL(href, pageUrl).href;
                    return {
                        text,
                        href: absoluteHref
                    };
                }
                return null;
            })
            .get()
            .filter(link => link);

        const links = linksArray
            .map(link => `(${link.text}, ${link.href})`)
            .join(' ');

        const bodyText = $('body')
            .text()
            .replace(/\s+/g, ' ')
            .trim(); 

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
