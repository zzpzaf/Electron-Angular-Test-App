export interface listURLData {
  listname: string;
  pubauthorslug: string;
}


export interface PostData extends listURLData{
  counter: number;
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
}


export type SubfolderRow = {
  folder_id: number;
  folder_name: string | null;
  parent_id: number | null;
};

export type LinkRow = {
  title: string | null;
  link: string | null;
};