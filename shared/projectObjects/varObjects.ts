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