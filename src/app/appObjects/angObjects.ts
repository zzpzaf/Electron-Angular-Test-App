export interface SiderMenuItem {
  label: string;
  icon: string;
  route: string;
}

// export const SiderMenuItems: SiderMenuItem[] = [
//     { label: 'Home', icon: 'home', route: '/home' },
//     { label: 'Settings', icon: 'setting', route: '/settings' },
//     { label: 'Profile', icon: 'user', route: '/profile' },
//     { label: 'Help', icon: 'question-circle', route: '/help' }
//   ];
export const SiderMenuItems: SiderMenuItem[] = [
    { label: 'Home', icon: '', route: '/home' },
    { label: 'URL', icon: '', route: '/article' },
    { label: 'Local File', icon: '', route: '/profile' },
    { label: 'Help', icon: '', route: '/help' }
];


export interface ScrapeResult {
  success: boolean;
  data?: any;
  error?: string;
}
