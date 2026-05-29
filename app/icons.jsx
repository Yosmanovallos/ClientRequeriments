// Provana Help Center — icon set. Stroke-based, inherit currentColor.
const Ic = ({ children, size = 24, sw = 1.7, fill = "none", vb = 24, ...p }) => (
  <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} fill={fill}
    stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {children}
  </svg>
);

const IconSearch = (p) => <Ic {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></Ic>;
const IconFolder = (p) => <Ic {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Ic>;
const IconGrid = (p) => <Ic sw="0" fill="currentColor" {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Ic>;
const IconChevR = (p) => <Ic {...p}><path d="m9 6 6 6-6 6" /></Ic>;
const IconChevD = (p) => <Ic {...p}><path d="m6 9 6 6 6-6" /></Ic>;
const IconChevU = (p) => <Ic {...p}><path d="m6 15 6-6 6 6" /></Ic>;
const IconX = (p) => <Ic {...p}><path d="M6 6l12 12M18 6 6 18" /></Ic>;
const IconCal = (p) => <Ic {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Ic>;
const IconLock = (p) => <Ic {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Ic>;
const IconUser = (p) => <Ic {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></Ic>;

// Request-type glyphs
const IconLaptop = (p) => <Ic {...p}><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2.5 20h19" /></Ic>;
const IconBook = (p) => <Ic {...p}><path d="M12 6.5C10.5 5.2 8.4 4.7 6 4.7c-1 0-1.7.1-2.3.3v13c.6-.2 1.3-.3 2.3-.3 2.4 0 4.5.5 6 1.8" /><path d="M12 6.5c1.5-1.3 3.6-1.8 6-1.8 1 0 1.7.1 2.3.3v13c-.6-.2-1.3-.3-2.3-.3-2.4 0-4.5.5-6 1.8z" /><path d="M12 6.5V19" /></Ic>;
const IconCloudUp = (p) => <Ic {...p}><path d="M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 9.5a3.5 3.5 0 0 1 .5 6.96" /><path d="M12 13v6M9.5 15.5 12 13l2.5 2.5" /></Ic>;
const IconWrench = (p) => <Ic {...p}><path d="M14.7 6.3a3.5 3.5 0 0 0-4.6 4.3L4 16.7 7.3 20l6.1-6.1a3.5 3.5 0 0 0 4.3-4.6l-2.2 2.2-2.2-.5-.5-2.2z" /><path d="m15.5 15.5 3.5 3.5" /></Ic>;
const IconCode = (p) => <Ic {...p}><path d="m9 8-4 4 4 4M15 8l4 4-4 4" /></Ic>;
const IconDatabase = (p) => <Ic {...p}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6" /><path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" /></Ic>;
const IconChats = (p) => <Ic {...p}><path d="M4 5.5h11a2 2 0 0 1 2 2V13a2 2 0 0 1-2 2H9l-4 3v-3a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2z" /><path d="M9 9h5M9 12h3" /></Ic>;

// Toolbar
const IconBold = (p) => <Ic sw="2.2" {...p}><path d="M7 5h6a3.2 3.2 0 0 1 0 6.4H7zM7 11.4h7a3.3 3.3 0 0 1 0 6.6H7z" /></Ic>;
const IconItalic = (p) => <Ic sw="2" {...p}><path d="M15 5h-5M14 19H9M14 5 10 19" /></Ic>;
const IconDots = (p) => <Ic sw="0" fill="currentColor" {...p}><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /></Ic>;
const IconColorA = (p) => <Ic sw="1.8" {...p}><path d="M6 17 10.5 6h1L16 17M7.6 13.5h6.8" /></Ic>;
const IconBullet = (p) => <Ic {...p}><circle cx="5" cy="7" r="1.2" fill="currentColor" stroke="none" /><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="5" cy="17" r="1.2" fill="currentColor" stroke="none" /><path d="M9 7h11M9 12h11M9 17h11" /></Ic>;
const IconNumList = (p) => <Ic sw="1.5" {...p}><path d="M10 7h10M10 12h10M10 17h10" /><text x="3" y="9" fontSize="6" fill="currentColor" stroke="none" fontFamily="Inter">1</text><text x="3" y="14.5" fontSize="6" fill="currentColor" stroke="none" fontFamily="Inter">2</text><text x="3" y="20" fontSize="6" fill="currentColor" stroke="none" fontFamily="Inter">3</text></Ic>;
const IconLink = (p) => <Ic {...p}><path d="M10 13a3.5 3.5 0 0 0 5 0l2.5-2.5a3.54 3.54 0 0 0-5-5L16 7" /><path d="M14 11a3.5 3.5 0 0 0-5 0l-2.5 2.5a3.54 3.54 0 0 0 5 5L8 17" /></Ic>;
const IconAt = (p) => <Ic {...p}><circle cx="12" cy="12" r="3.5" /><path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.4 6.8" /></Ic>;
const IconEmoji = (p) => <Ic {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14a4 4 0 0 0 7 0" /><circle cx="9" cy="10" r="0.6" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none" /></Ic>;
const IconTable = (p) => <Ic {...p}><rect x="4" y="5" width="16" height="14" rx="1.5" /><path d="M4 10h16M4 14.5h16M10 5v14" /></Ic>;
const IconCodeBlock = (p) => <Ic sw="1.5" {...p}><path d="m8 9-3 3 3 3M16 9l3 3-3 3M13 7l-2 10" /></Ic>;
const IconQuote = (p) => <Ic sw="0" fill="currentColor" {...p}><path d="M6 16c-1.1 0-2-.9-2-2v-2c0-2.2 1.8-4 4-4v2c-1.1 0-2 .9-2 2h1c1.1 0 2 .9 2 2s-.9 2-2 2zm9 0c-1.1 0-2-.9-2-2v-2c0-2.2 1.8-4 4-4v2c-1.1 0-2 .9-2 2h1c1.1 0 2 .9 2 2s-.9 2-2 2z" /></Ic>;
const IconInfo = (p) => <Ic {...p}><circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" /><circle cx="12" cy="8.2" r="1.1" fill="#fff" stroke="none" /><path d="M12 11v6" stroke="#fff" strokeWidth="2" /></Ic>;
const IconPlus = (p) => <Ic {...p}><path d="M12 6v12M6 12h12" /></Ic>;
const IconAlign = (p) => <Ic {...p}><path d="M4 6h16M4 12h12M4 18h16" /></Ic>;
const IconDivider = (p) => <Ic {...p}><path d="M4 12h16" /><path d="M7 7h10M7 17h10" opacity="0.4" /></Ic>;
const IconClearFmt = (p) => <Ic sw="1.5" {...p}><path d="M7 5h11M11 5l-2 9M6 19h6" /><path d="m16 14 5 5M21 14l-5 5" /></Ic>;
const IconUploadCloud = (p) => <Ic {...p}><path d="M7 17a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 8.5a3.5 3.5 0 0 1 .5 6.96" /><path d="M12 21V11M8.5 14 12 10.5 15.5 14" /></Ic>;

Object.assign(window, {
  IconSearch, IconFolder, IconGrid, IconChevR, IconChevD, IconChevU, IconX, IconCal, IconLock, IconUser,
  IconLaptop, IconBook, IconCloudUp, IconWrench, IconCode, IconDatabase, IconChats,
  IconBold, IconItalic, IconDots, IconColorA, IconBullet, IconNumList, IconLink, IconAt, IconEmoji,
  IconTable, IconCodeBlock, IconQuote, IconInfo, IconPlus, IconAlign, IconDivider, IconClearFmt, IconUploadCloud,
});
