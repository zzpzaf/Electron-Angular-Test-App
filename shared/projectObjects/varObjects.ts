export interface listURLData {
  listname: string;
  pubauthorslug: string;
}


export interface PostData extends listURLData{
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
}

// export interface MarkedPostData extends PostData {
//   content: string;
// }



// export type SubfolderRow = {
//   folder_id: number;
//   folder_name: string | null;
//   parent_id: number | null;
// };


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

// interface FolderNode_old1 {
//   folder_id: number;
//   folder_name: string;
//   parent_id: number | null;
//   children?: FolderNode_old1[];
// }


export interface FolderNode {
  folder_id: number;
  folder_name: string;
  parent_id: number | null;
  has_bookmarks: boolean;
  children: FolderNode[];
}