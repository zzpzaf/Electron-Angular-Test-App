import { listURLData } from '../projectObjects/varObjects';


export function isValidUrl(url: string): boolean {
  console.log('Entered URL: ', url);
  try {
    new URL(url);
    return true;
  } catch (_) {
    return false;
  }
}



export function analyzeListedLink(url: string): listURLData {
  console.log('Link to be analyzed: ', url);

  const listLiteral = 'list';
  const urlObj = new URL(url);
  // console.log('href:', urlObj.href);
  // console.log('origin:', urlObj.origin);
  // console.log('protocol:', urlObj.protocol);
  // console.log('username:', urlObj.username);
  // console.log('password:', urlObj.password);
  // console.log('host:', urlObj.host);
  // console.log('hostname:', urlObj.hostname);
  // console.log('port:', urlObj.port);
  // console.log('pathname:', urlObj.pathname);
  // console.log('search:', urlObj.search);
  // console.log('hash:', urlObj.hash);

  let v_listname = '';
  let v_pubauthorslug = '';
  let emptyObj: listURLData = {
    listname: v_listname,
    pubauthorslug: v_pubauthorslug,
  };
  if (url.trim().length === 0) return emptyObj;

  const pathname = urlObj.pathname;
  console.log('Link Pathname: ', pathname);
  const parts = getPathNameParts(pathname);
  console.log('>===>> URL Path Name has: ', parts.length, ' - parts: ', parts);
  const i = parts.indexOf(listLiteral);
  if ( parts.length < 2 || parts.length > 3 || i < 0) return emptyObj;

  if (i === 0 && parts.length === 2) {
    v_listname = parts[1].includes('-')? parts[1].slice(0, parts[1].lastIndexOf('-')) : parts[1];
    v_pubauthorslug = urlObj.hostname.replace(/\.[^.]+\.[^.]+$/, ''); 
  } else if (i === 1 && parts.length === 3) {
    v_listname =parts[2].replace(/-[a-fA-F0-9]{12}$/, '');
    v_pubauthorslug = parts[0].startsWith('@') ? parts[0].slice(1) : parts[0];
  }
  console.log('Listname: ',v_listname, '  -  Pub Author Slug: ',v_pubauthorslug);
  return {listname: v_listname, pubauthorslug: v_pubauthorslug};
}

export function getMediumSlugFromUrl(url: string): string {
  console.log('Link to be analyzed for slug: ', url);
  if (url.trim().length === 0) return '';
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;
  console.log('Link Pathname: ', pathname);
  const parts = getPathNameParts(pathname);
  console.log('>===>> URL Path Name has: ', parts.length, ' - parts: ', parts);
  if (parts.length === 0) return '';
  return parts[parts.length-1];
}


export function getPathNameParts(pathName: string): string[] {
  if (pathName.trim().length === 0) return [];
  // Remove leading and trailing slashes
  const trimmedPath = pathName.replace(/^\/+|\/+$/g, '');
  // Split by slash
  const parts = trimmedPath.split('/');
  return parts;
}




export function extractFirstPathPart(pathname: string): string {
  const parts = getPathNameParts(pathname);
  if (parts.length === 0 || !parts[0]) {
    return ''; // No part found
  }

  let firstPart = parts[0];

  // If first character is @, trim it
  if (firstPart.startsWith('@')) {
    firstPart = firstPart.substring(1);
  }

  return firstPart;
}


// Extracts all https from the text (anywhere in the text)
export function extractHttps(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s"'<>]+/g;
  const matches = text.match(urlRegex);
  return matches || []; // returns empty array if no matches
}

// Extracts all https from the text (anywhere in the text)
// Excludes image URLs (by common image file extensions)
export function extractNonImageHttps(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
  const imageExtensions = /\.(jpe?g|png|gif|webp|bmp|svg|tiff?)(\?.*)?$/i;

  const matches = text.match(urlRegex) || [];
  const nonImageUrls = matches.filter(url => !imageExtensions.test(url));
  
  return nonImageUrls;
  
}

// Extracts all URLs from the text (anywhere in the text)
// Extracts URLs specifically from "link" or "url" key-value patterns
// Excludes image URLs (by common image file extensions)
export function extractAllNonImageUrls1(text: string): string[] {
  const generalUrlRegex = /https?:\/\/[^\s"'<>\\]+/gi;
  const keyUrlRegex = /"(link|url)"\s*:\s*"https?:\/\/[^\s"'<>\\]+"/gi;
  const imageExtensions = /\.(jpe?g|png|gif|webp|bmp|svg|tiff?)(\?.*)?$/i;

  const keyMatches = [...text.matchAll(keyUrlRegex)]
    .map(match => {
      const urlMatch = match[0].match(/https?:\/\/[^\s"'<>\\]+/i);
      return urlMatch ? urlMatch[0] : null;
    })
    .filter((url): url is string => url !== null); // type guard here ✅

  const generalMatches = text.match(generalUrlRegex) || [];

  const allUrls = Array.from(new Set([...keyMatches, ...generalMatches]));

  const nonImageUrls = allUrls.filter(url => !imageExtensions.test(url));

  return nonImageUrls;
}

// Extracts all URLs from the text (anywhere in the text)
// Extracts URLs specifically from "link" or "url" key-value patterns
// Excludes image URLs (by common image file extensions)
// Excludes pottential images that are prefixed like "image": , "img": "photo": , etc. 
export function extractAllNonImageUrls(
  text: string,
  excludedKeys: string[] = ["image", "img", "thumbnail", "photo", "avatar"]
): string[] {
  const generalUrlRegex = /https?:\/\/[^\s"'<>\\]+/gi;
  const includedKeyRegex = /"(link|url)"\s*:\s*"https?:\/\/[^\s"'<>\\]+"/gi;
  const imageExtensions = /\.(jpe?g|png|gif|webp|bmp|svg|tiff?)(\?.*)?$/i;

  // Dynamically build regex for excluded keys
  const excludedKeyPattern = `"(${excludedKeys.join("|")})"\\s*:\\s*"https?:\\/\\/[^"'<>\\\\]+`;
  const excludedKeyRegex = new RegExp(excludedKeyPattern, "gi");

  // Step 1: Extract URLs from included keys
  const includedKeyMatches = [...text.matchAll(includedKeyRegex)]
    .map(match => {
      const urlMatch = match[0].match(/https?:\/\/[^\s"'<>\\]+/i);
      return urlMatch ? urlMatch[0] : null;
    })
    .filter((url): url is string => url !== null);

  // Step 2: Extract all general URLs from the text
  const generalMatches = text.match(generalUrlRegex) || [];

  // Step 3: Extract URLs from excluded keys
  const excludedKeyMatches = [...text.matchAll(excludedKeyRegex)]
    .map(match => {
      const urlMatch = match[0].match(/https?:\/\/[^\s"'<>\\]+/i);
      return urlMatch ? urlMatch[0] : null;
    })
    .filter((url): url is string => url !== null);

  // Step 4: Combine included + general URLs and deduplicate
  const allUrls = Array.from(new Set([...includedKeyMatches, ...generalMatches]));

  // Step 5: Filter out image extension URLs and excluded key URLs
  const nonImageUrls = allUrls.filter(
    url => !imageExtensions.test(url) && !excludedKeyMatches.includes(url)
  );

  return nonImageUrls;
}

