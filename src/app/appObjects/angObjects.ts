export interface SiderMenuItem {
  label: string;
  icon: string;
  route: string;
}

export const SiderMenuItems: SiderMenuItem[] = [
    { label: 'Home', icon: '', route: '/home' },
    { label: 'Links', icon: '', route: '/links' },
    { label: 'File URLs', icon: '', route: '/urlsfile' },
    { label: 'Bookmarks', icon: '', route: '/bookmarks' },
    { label: 'Markdown', icon: '', route: '/markdown' },
    { label: 'Help', icon: '', route: '/help' }
];


export interface ScrapeResult {
  success: boolean;
  data?: any;
  error?: string;
}
