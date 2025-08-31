import { Buffer } from 'buffer';

export interface listURLData {
  listname: string;
  pubauthorslug: string;
}


export interface PostData extends listURLData{
  id?: number;
  counter?: number;
  hostname: string;
  timestamp: string;
  pubname: string;
  authorname: string;
  authorlink: string;
  title: string;
  link: string;
  image: string;
  date: string;
  likes: number;
  comments: number;
  content?: string;
  ranking?: number;     // added on 250820
}




// ----------------- single-image: streamed with abort -----------------
export type ImageDownloadResult = {
  success: boolean;
  aborted?: boolean;
  reason?: string;
  imageId?: number;
  inserted?: boolean;
  mime_type?: string;
  byte_length?: number;
  sha256_hex?: string;
  file_name?: string;
};

export type RewriteResultItem = { orgImgUrl: string; orderIndx?: number } & ImageDownloadResult;

export type ImageRow = {
  mime_type: string;
  imgBlob: Buffer;
  alt_text: string | null;
  byte_length: number | null;
};

export interface ExtractedImage {
  orderIndx: number;
  imgUrl: string;
}

export interface ProcessMarkdownResult {
  extracted: ExtractedImage[];
  results: RewriteResultItem[];
}









export interface Category {
  id: number;
  name: string;
  description: string;
  parent_id: number
}

export type CategoryRow = {
  id: number;
  name: string;
  description: string | null;
  parent_id: number | null;
};


export interface CategoryNode {
  id: number;
  name: string;
  description: string; 
  parent_id: number | null;
  subCategoryNode: CategoryNode[];
}


export type SubfolderRow = {
  folder_id: number;
  folder_name: string | null;
  parent_id: number | null;
  has_bookmarks: 0 | 1; // SQLite returns 0/1
};


export type LinkRow = {
  title: string | null;
  link: string | null;
};

export type FolderMatch = {
  id: number;
  parent_id: number | null;
};


export interface FolderNode {
  folder_id: number;
  folder_name: string;
  parent_id: number | null;
  has_bookmarks: boolean;
  children: FolderNode[];
}