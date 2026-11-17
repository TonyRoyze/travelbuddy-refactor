'use client';

import Link from 'next/link';
import { useId, useState, type FocusEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, type LucideIcon } from 'lucide-react';

type MenuItem = { label: string; description: string; href: string; icon: LucideIcon };
export type NavigationItem = { label: string; href: string; active?: boolean; subMenus?: { title: string; items: MenuItem[] }[] };

export function DropdownNavigation({ navItems }: { navItems: NavigationItem[] }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuId = useId();
  const closeOnBlur = (event: FocusEvent<HTMLLIElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpenMenu(null);
  };

  return <nav className="desktop-nav dropdown-navigation" aria-label="Main navigation" onKeyDown={event => { if (event.key === 'Escape') { setOpenMenu(null); (event.target as HTMLElement).blur(); } }}>
    <ul>{navItems.map(item => <li key={item.label} onMouseEnter={() => item.subMenus && setOpenMenu(item.label)} onMouseLeave={() => setOpenMenu(null)} onBlur={closeOnBlur}>
      <div className="dropdown-navigation-trigger">
        <Link href={item.href} className={item.active ? 'active' : ''} aria-current={item.active ? 'page' : undefined} onClick={() => setOpenMenu(null)}>{item.label}</Link>
        {item.subMenus && <button type="button" aria-label={`${item.label} menu`} aria-expanded={openMenu === item.label} aria-controls={`${menuId}-${item.label}`} onClick={() => setOpenMenu(openMenu === item.label ? null : item.label)}><ChevronDown size={15} className={openMenu === item.label ? 'open' : ''}/></button>}
      </div>
      <AnimatePresence>{openMenu === item.label && item.subMenus && <motion.div id={`${menuId}-${item.label}`} className="dropdown-navigation-panel" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.15 }}>
        {item.subMenus.map(group => <section key={group.title}><h3>{group.title}</h3><ul>{group.items.map(({ icon: Icon, ...entry }) => <li key={entry.label}><Link href={entry.href} onClick={() => setOpenMenu(null)}><span className="dropdown-navigation-icon"><Icon size={19}/></span><span><strong>{entry.label}</strong><small>{entry.description}</small></span></Link></li>)}</ul></section>)}
      </motion.div>}</AnimatePresence>
    </li>)}</ul>
  </nav>;
}
