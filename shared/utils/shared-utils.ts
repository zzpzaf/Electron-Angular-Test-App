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
  console.log('Path Name has: ', parts.length, 'parts: ', parts);
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
