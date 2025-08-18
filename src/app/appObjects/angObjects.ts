

export interface SiderMenuItem {
  label: string;
  icon: string;
  route: string;
}

export const SiderArticlesMenuItems: SiderMenuItem[] = [
  { label: 'Articles', icon: '', route: '/articles' },
  { label: 'Categories', icon: '', route: 'categories' },
  { label: 'Help', icon: '', route: '/help' }
];

export const SiderScrapeMenuItems: SiderMenuItem[] = [
  { label: 'Links', icon: '', route: '/links' },
  { label: 'File URLs', icon: '', route: '/urlsfile' },
  { label: 'Bookmarks', icon: '', route: '/bookmarks' },
  { label: 'Markdown', icon: '', route: '/markdown' },
  { label: 'Help', icon: '', route: '/help' }
];

// lookup map for sider menu array objects
export const SIDER_MENUS = {
  SiderArticlesMenuItems,
  SiderScrapeMenuItems
} as const satisfies Record<string, readonly SiderMenuItem[]>;

export type SiderMenuKey = keyof typeof SIDER_MENUS; // 'SiderArticlesMenuItems' | 'SiderScrapeMenuItems'

export interface MainAppMenuItem {
  id: number;
  label: string;
  siderMenuName: SiderMenuKey;
}

export const MainAppMenuItems :  MainAppMenuItem[] = [
  { id: 1, label: 'Scraping', siderMenuName: 'SiderScrapeMenuItems' },
  { id: 2, label: 'Articles', siderMenuName: 'SiderArticlesMenuItems'},
  { id: 3, label: 'Other', siderMenuName: 'SiderArticlesMenuItems'}
]



export interface ScrapeResult {
  success: boolean;
  data?: any;
  error?: string;
}
