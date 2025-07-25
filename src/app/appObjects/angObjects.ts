export interface SiderMenuItem {
  label: string;
  icon: string;
  route: string;
}

export const SiderMenuItems: SiderMenuItem[] = [
    { label: 'Home', icon: '', route: '/home' },
    { label: 'URL', icon: '', route: '/article' },
    { label: 'File URLs', icon: '', route: '/urlsfile' },
    { label: 'SQLite URLs', icon: '', route: '/sqliteurls' },
    { label: 'Help', icon: '', route: '/help' }
];


export interface ScrapeResult {
  success: boolean;
  data?: any;
  error?: string;
}
