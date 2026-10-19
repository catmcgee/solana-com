"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import {
  AnchorProvider,
  ScrollProvider,
  TOCItem,
  useActiveAnchor,
  type TOCItemType,
} from "fumadocs-core/toc";

/**
 * "On this page", in the right column from 1280px: h2 entries with their
 * h3 entries nested, the heading in view highlighted (Fumadocs' anchor
 * observer, one active item), as the docs have shown it. Markup keeps the
 * #table-of-contents ids the docs CSS targets.
 */
interface Node {
  item: TOCItemType;
  children: Node[];
}

function nest(items: TOCItemType[]): Node[] {
  const roots: Node[] = [];
  const top = items.length ? Math.min(...items.map((i) => i.depth)) : 2;
  let parent: Node | undefined;
  for (const item of items) {
    const node = { item, children: [] };
    if (item.depth > top && parent) parent.children.push(node);
    else {
      roots.push(node);
      parent = node;
    }
  }
  return roots;
}

function List({ nodes, depth }: { nodes: Node[]; depth: number }) {
  const active = useActiveAnchor();
  return (
    <ul
      id={depth === 0 ? "table-of-contents-content" : undefined}
      className={depth === 0 ? "toc" : "toc-sub"}
    >
      {nodes.map(({ item, children }) => {
        const id = item.url.slice(1);
        const isActive = active === id;
        return (
          <li
            key={item.url}
            className="toc-item"
            data-depth={depth}
            data-active={isActive ? "true" : undefined}
          >
            <TOCItem
              href={item.url}
              className="toc-link"
              aria-current={isActive ? "location" : undefined}
            >
              {item.title}
            </TOCItem>
            {children.length ? (
              <List nodes={children} depth={depth + 1} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function DocsToc({
  toc,
  label,
  icon,
}: {
  toc: TOCItemType[];
  label: string;
  icon: ReactNode;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const items = toc.filter((i) => i.depth >= 2 && i.depth <= 3);
  if (!items.length) return null;
  return (
    <AnchorProvider toc={items} single>
      <div id="table-of-contents-layout">
        <div id="table-of-contents">
          <div className="toc-scroll" ref={scroll}>
            <ScrollProvider containerRef={scroll}>
              <nav aria-label={label}>
                <h2 className="toc-heading">
                  <span className="toc-heading-button">
                    {icon}
                    <span>{label}</span>
                  </span>
                </h2>
                <div>
                  <List nodes={nest(items)} depth={0} />
                </div>
              </nav>
            </ScrollProvider>
          </div>
        </div>
      </div>
    </AnchorProvider>
  );
}
