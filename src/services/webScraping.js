const { exec } = require('child_process');
const cheerio = require('cheerio');

function escapeShellArg(arg) {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

async function googleSearch(query) {
  return new Promise((resolve, reject) => {
    const encodedQuery = encodeURIComponent(query);
    const escapedQuery = escapeShellArg(encodedQuery);
    const command = `curl_chrome116 'https://www.google.com/search?q=${escapedQuery}'`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function parseGoogleResults(html) {
  const $ = cheerio.load(html);
  const results = [];

  $('div.g').each((i, elem) => {
    if (i < 10) {
      const titleElem = $(elem).find('h3.LC20lb.MBeuO.DKV0Md').first();
      const linkElem = $(elem).find('a[jsname="UWckNb"]').first();
      const snippetElem = $(elem).find('div.VwiC3b.yXK7lf.lVm3ye.r025kc.hJNv6b.Hdw6tb').first();
      
      if (titleElem.length && linkElem.length) {
        results.push({
          title: titleElem.text().trim(),
          link: linkElem.attr('href'),
          snippet: snippetElem.find('span').text().trim()
        });
      }
    }
  });

  return results;
}

async function performSearch(query) {
  try {
    const html = await googleSearch(query);
    const results = parseGoogleResults(html);
    return results;
  } catch (error) {
    console.error('Error performing search:', error);
    throw error;
  }
}

module.exports = { performSearch };