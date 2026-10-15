// Icônes en trait (currentColor), 1em de côté.
const Svg = ({ children, fill }) => (
  <svg className="icon" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"
    fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'}
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

export const IconPlus = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>
export const IconEdit = () => <Svg><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></Svg>
export const IconPlay = () => <Svg fill><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" /></Svg>
export const IconStop = () => <Svg fill><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>
export const IconMore = () => <Svg fill><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></Svg>
