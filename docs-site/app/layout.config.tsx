import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 6C9 6 7 8 7 10.5C7 13 9 14 12 14C15 14 17 15 17 17.5C17 20 15 22 12 22"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
        <span className="font-semibold">Engram</span>
      </>
    ),
    transparentMode: 'top',
  },
  links: [
    {
      text: 'Docs',
      url: '/docs',
      active: 'nested-url',
    },
    {
      text: 'GitHub',
      url: 'https://github.com/RyanLisse/engram',
    },
  ],
};
