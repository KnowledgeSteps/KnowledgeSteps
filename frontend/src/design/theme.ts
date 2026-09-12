import type { ThemeConfig } from 'antd'

/** The single source of truth for all current and future KnowledgeSteps pages. */
export const visualTokens = {
  'blue-light': '#AFD0FC',
  'blue-medium': '#629FFC',
  primary: '#2977F8',
  'history-ticket-grid': 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
  'history-ticket-shine': 'linear-gradient(115deg, transparent 0%, transparent 40%, rgb(255 255 255 / 10%) 45%, rgb(255 255 255 / 85%) 50%, rgb(255 255 255 / 10%) 55%, transparent 60%, transparent 100%)',
  'login-title-gradient': 'linear-gradient(90deg, var(--blue-light) 0%, var(--blue-medium) 50%, var(--primary) 100%)',
  'text-main': '#182C49',
  'text-sub': '#53657D',
  'text-muted': '#667891',
  'bg-page': '#FFFFFF',
  'pattern-background': '#F8FAFC',
  'pattern-line': 'rgb(41 119 248 / 4%)',
  'bg-card': '#FFFFFF',
  'graph-node-pattern': 'linear-gradient(135deg, transparent 18.75%, var(--bg-subtle) 0 31.25%, transparent 0), repeating-linear-gradient(45deg, var(--bg-subtle) -6.25% 6.25%, var(--bg-card) 0 18.75%)',
  'graph-node-shadow': '0 30px 30px -10px rgb(24 44 73 / 18%)',
  'waiting-glass': 'rgb(255 255 255 / 95%)',
  'waiting-shadow': '20px 20px 60px rgb(24 44 73 / 12%), -20px -20px 60px var(--bg-card)',
  'example-glass': 'rgb(245 248 254 / 78%)',
  'example-shadow': '12px 17px 51px rgb(24 44 73 / 12%)',
  'bg-subtle': '#F5F8FE',
  border: '#DCE6F4',
  error: '#B42318',
  'delete-button-bg': '#e62222',
  'delete-button-hover': '#ff3636',
  'delete-button-divider': '#c41b1b',
  warning: '#AD6800',
  'font-family': '"Chillax", "Source Han Sans SC", sans-serif',
  'radius-card': '16px',
  'radius-item': '8px',
  'shadow-card': '0 4px 20px rgb(24 44 73 / 4%)',
} as const

export function installVisualTokens() {
  for (const [name, value] of Object.entries(visualTokens)) {
    document.documentElement.style.setProperty(`--${name}`, value)
  }
}

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: visualTokens.primary,
    colorInfo: visualTokens.primary,
    colorSuccess: visualTokens.primary,
    colorWarning: visualTokens.warning,
    colorError: visualTokens.error,
    colorText: visualTokens['text-main'],
    colorTextSecondary: visualTokens['text-sub'],
    colorTextPlaceholder: visualTokens['text-muted'],
    colorBgContainer: visualTokens['bg-card'],
    colorBgLayout: visualTokens['bg-page'],
    colorBorder: visualTokens.border,
    colorPrimaryHover: visualTokens['blue-medium'],
    colorPrimaryActive: visualTokens.primary,
    colorPrimaryBg: visualTokens['bg-subtle'],
    colorPrimaryBgHover: visualTokens['blue-light'],
    colorPrimaryBorder: visualTokens['blue-light'],
    colorPrimaryBorderHover: visualTokens['blue-medium'],
    fontFamily: visualTokens['font-family'],
    fontSize: 14,
    fontWeightStrong: 600,
    controlHeight: 44,
    borderRadius: 8,
    borderRadiusLG: 16,
    wireframe: false,
  },
  components: {
    Button: { primaryShadow: 'none', defaultShadow: 'none', fontWeight: 600, controlHeightLG: 50 },
    Card: { bodyPadding: 24, headerFontSize: 18 },
    Input: { activeShadow: '0 0 0 3px rgb(175 208 252 / 45%)' },
    Progress: { defaultColor: visualTokens.primary, remainingColor: visualTokens['bg-subtle'] },
    Modal: { titleFontSize: 22 },
  },
}
