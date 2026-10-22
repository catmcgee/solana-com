import type { NavGroup, NavNode, NavTab } from "@/lib/docs/navigation";
import { SidebarGroup, SidebarScrollToCurrent } from "./docs-sidebar.client";
import { ChevronIcon, ExternalArrowIcon } from "./docs-ui-icons";
import { DocsLink } from "./docs-link";

/**
 * Sidebar of the current tab, server-rendered: sections (first-level
 * groups) with a small mono heading, pages, collapsible groups and the
 * tutorial path boxes (`tag` groups, styled by apps/docs/styles/stepper.css).
 * The markup keeps the hooks the docs CSS has always targeted:
 * #sidebar-content, #navigation-items, .sidebar-group-header,
 * li[data-group-tag] > button[data-nav-href] + ul, .nav-tag-pill and
 * a[aria-current="page"]. Indent: 1rem + 0.75rem per level (inline
 * padding-left, which the RTL rules mirror).
 */

function indent(depth: number) {
  return { paddingLeft: `${1 + depth * 0.75}rem` };
}

function containsUrl(group: NavGroup, url: string): boolean {
  if (group.root?.url === url) return true;
  return group.children.some((child) =>
    child.kind === "group"
      ? containsUrl(child, url)
      : child.kind === "page" && child.url === url,
  );
}

function Item({
  node,
  depth,
  current,
}: {
  node: NavNode;
  depth: number;
  current: string;
}) {
  // Links out of the docs (nav links, pages with a `url`) open in a new tab.
  if (node.kind === "link" || (node.kind === "page" && /^https?:/.test(node.url))) {
    return (
      <li className="sidebar-item" data-title={node.title}>
        <a
          href={node.url}
          className="sidebar-link"
          style={indent(depth)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="sidebar-link-inner">
            <div className="sidebar-link-text">
              <span>{node.title}</span>
            </div>
            <div className="sidebar-ext">
              <ExternalArrowIcon className="sidebar-ext-icon" />
            </div>
          </div>
        </a>
      </li>
    );
  }
  if (node.kind === "page") {
    const active = node.url === current;
    return (
      <li
        id={node.url}
        className="sidebar-item"
        data-title={node.title}
        data-active={active ? "true" : undefined}
        data-active-nav-item={active ? "true" : undefined}
      >
        <DocsLink
          href={node.url}
          className="sidebar-link"
          style={indent(depth)}
          aria-current={active ? "page" : undefined}
        >
          <div className="sidebar-link-inner">
            <div className="sidebar-link-text">
              <span>{node.title}</span>
            </div>
          </div>
        </DocsLink>
      </li>
    );
  }
  const open = node.expanded || containsUrl(node, current);
  const rootActive = node.root?.url === current;
  return (
    <SidebarGroup
      id={node.root?.url}
      title={node.title}
      tag={node.tag ?? ""}
      href={node.root?.url}
      defaultOpen={open}
      active={containsUrl(node, current)}
      rootActive={rootActive}
      style={indent(depth)}
      label={
        node.tag ? (
          <div className="sidebar-group-label sidebar-group-label-tag">
            <span>{node.title}</span>
            <span className="nav-tag-pill">
              <span className="nav-tag-pill-text" data-nav-tag={node.tag}>
                {node.tag}
              </span>
            </span>
          </div>
        ) : (
          <div className="sidebar-group-label">
            <span>{node.title}</span>
          </div>
        )
      }
      chevron={<ChevronIcon className="sidebar-chevron" />}
    >
      {node.children.map((child, i) => (
        <Item key={i} node={child} depth={depth + 1} current={current} />
      ))}
    </SidebarGroup>
  );
}

export function SidebarNav({
  tab,
  current,
  id = "navigation-items",
}: {
  tab: NavTab;
  current: string;
  /** The desktop sidebar's list is #navigation-items; the menu copy has none. */
  id?: string;
}) {
  const grouped = tab.items.every((n) => n.kind === "group");
  if (!grouped) {
    // Page-only tabs (Start here): each entry is its own list; a group
    // (the Quickstart path box) is set off by a section gap.
    return (
      <div id={id || undefined} className="navigation-items">
        {tab.items.map((node, i) => (
          <ul
            key={i}
            className={
              node.kind === "group"
                ? "sidebar-group sidebar-group-spaced"
                : "sidebar-group"
            }
          >
            <Item node={node} depth={0} current={current} />
          </ul>
        ))}
      </div>
    );
  }
  return (
    <div id={id || undefined} className="navigation-items">
      {(tab.items as NavGroup[]).map((section, i) => (
        <div key={i} className="sidebar-section">
          <div className="sidebar-group-header">
            <h3 className="sidebar-title">
              <span>{section.title}</span>
            </h3>
          </div>
          <ul className="sidebar-group">
            {section.children.map((node, j) => (
              <Item key={j} node={node} depth={0} current={current} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DocsSidebar({
  tab,
  current,
  label,
}: {
  tab: NavTab;
  current: string;
  label: string;
}) {
  return (
    <nav id="sidebar" aria-label={label}>
      <div id="sidebar-content" data-docs-sidebar-scroll="">
        <div className="sidebar-scroll" data-docs-sidebar-viewport="">
          <div className="sidebar-inner">
            <div className="sidebar-fade" aria-hidden="true" />
            <SidebarNav tab={tab} current={current} />
          </div>
          <SidebarScrollToCurrent current={current} />
        </div>
      </div>
    </nav>
  );
}
