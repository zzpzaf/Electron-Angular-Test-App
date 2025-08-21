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
  title: string;
  link: string;
  image: string;
  date: string;
  likes: number;
  comments: number;
  content?: string;
  ranking?: number;     // added on 250820
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